import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Cache, memoryStorage } from "../../packages/api-client/data/cache";
import {
  createTransport,
  retryDelay,
  responseError,
} from "../../packages/api-client/data/transport";
import {
  ApiError,
  errorMessage,
  money,
} from "../../packages/api-client/domain/types";
import { checkout } from "../../packages/storefront/domain/checkout";

const uuid = "00000000-0000-4000-8000-000000000001";
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const receipt = {
  operation_id: uuid,
  status: "queued",
  poll_url: `/api/v1/shops/fashion/operations/${uuid}`,
};
function client(fetcher: typeof fetch, storage = memoryStorage()) {
  return createTransport({
    shop: "fashion",
    origin: "https://example.test",
    native: true,
    getToken: async () => null,
    randomUUID: () => uuid,
    storage,
    fetch: fetcher,
    sleep: async () => undefined,
  });
}
afterEach(() => vi.unstubAllGlobals());

it("normalizes empty and malformed error bodies and rejects malformed origins", () => {
  for (const body of [null, { message: 123 }, {}])
    expect(responseError(400, body).message).toBe(
      "The request could not complete.",
    );
  expect(() =>
    createTransport({
      shop: "fashion",
      origin: "not a url",
      native: true,
      getToken: async () => null,
      randomUUID: () => uuid,
      storage: memoryStorage(),
    }),
  ).toThrow("Invalid API origin");
});

it("uses bounded default timers and bearer authentication for native retries", async () => {
  vi.useFakeTimers();
  try {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json({ ok: true }));
    const request = createTransport({
      shop: "fashion",
      origin: "https://example.test",
      native: true,
      getToken: async () => "bearer",
      randomUUID: () => uuid,
      storage: memoryStorage(),
      fetch: fetcher,
    });
    const pending = request("products", z.unknown());
    await vi.runAllTimersAsync();
    await pending;
    expect(fetcher.mock.lastCall?.[1]?.headers).toMatchObject({
      Authorization: "Bearer bearer",
    });
  } finally {
    vi.useRealTimers();
  }
});

it("handles browser CSRF failure and absent cookies without persisting credentials", async () => {
  vi.stubGlobal("document", { cookie: "other=value" });
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({}, 403));
  const request = createTransport({
    shop: "fashion",
    origin: "",
    native: false,
    getToken: async () => null,
    randomUUID: () => uuid,
    storage: memoryStorage(),
    fetch: fetcher,
    sleep: async () => undefined,
  });
  await expect(
    request("auth/login", z.unknown(), "POST", {}),
  ).rejects.toMatchObject({ status: 403 });
  fetcher
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(json(receipt, 202))
    .mockResolvedValueOnce(
      json({
        operation_id: uuid,
        status: "succeeded",
        http_status: null,
        result: { ok: true },
      }),
    );
  await expect(request("auth/login", z.unknown(), "POST", {})).resolves.toEqual(
    { ok: true },
  );
  expect(fetcher.mock.lastCall?.[1]?.credentials).toBe("include");
  expect(fetcher.mock.lastCall?.[1]?.headers).not.toHaveProperty(
    "X-XSRF-TOKEN",
  );
  fetcher.mockResolvedValueOnce(json({ ok: true }));
  await expect(request("auth/me", z.unknown())).resolves.toEqual({ ok: true });
});

it("normalizes a worker failure with no status and tolerates receipt cleanup failure", async () => {
  const storage = memoryStorage();
  storage.remove = async () => {
    throw new Error("quota");
  };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json(receipt, 202))
    .mockResolvedValueOnce(
      json({
        operation_id: uuid,
        status: "failed",
        http_status: null,
        result: null,
      }),
    );
  await expect(
    client(fetcher, storage)("products", z.unknown()),
  ).rejects.toMatchObject({ status: 500 });
});

describe("ambiguous and malformed HTTP outcomes", () => {
  it.each([204, 304, 301, 400, 405, 413, 418, 500, 502, 503, 504])(
    "handles HTTP %s explicitly",
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(async () =>
          status === 204 || status === 304
            ? new Response(null, { status })
            : json({ message: "Rejected" }, status),
        );
      const request = client(fetcher);
      if (status === 204)
        await expect(
          request("products", z.undefined()),
        ).resolves.toBeUndefined();
      else
        await expect(request("products", z.unknown())).rejects.toBeInstanceOf(
          ApiError,
        );
      expect(fetcher.mock.calls.length).toBe(status >= 500 ? 3 : 1);
    },
  );
  it.each([
    new Response("<html>bad gateway</html>"),
    new Response("{broken", {
      headers: { "Content-Type": "application/json" },
    }),
    json({ wrong: true }),
  ])("rejects invalid success bodies", async (response) => {
    await expect(
      client(vi.fn<typeof fetch>().mockResolvedValue(response))(
        "products",
        z.object({ ok: z.boolean() }),
      ),
    ).rejects.toMatchObject({ kind: "invalid_body" });
  });
  it.each([
    new Error("offline"),
    Object.assign(new Error("slow"), { name: "TimeoutError" }),
    "network failure",
  ])("bounds network retries", async (error) => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(error);
    await expect(
      client(fetcher)("products", z.unknown()),
    ).rejects.toMatchObject({
      kind:
        error instanceof Error && error.name === "TimeoutError"
          ? "timeout"
          : "network",
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("rejects foreign and mismatched operation receipts", async () => {
    await expect(
      client(
        vi.fn<typeof fetch>().mockResolvedValue(
          json(
            {
              ...receipt,
              poll_url: "/api/v1/shops/electronics/operations/" + uuid,
            },
            202,
          ),
        ),
      )("products", z.unknown()),
    ).rejects.toMatchObject({ kind: "invalid_body" });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(receipt, 202))
      .mockResolvedValue(
        json({
          operation_id: "00000000-0000-4000-8000-000000000002",
          status: "succeeded",
          http_status: 200,
          result: {},
        }),
      );
    await expect(
      client(fetcher)("products", z.unknown()),
    ).rejects.toMatchObject({ kind: "invalid_body" });
  });
  it("preserves the action key through polling timeout and a later retry", async () => {
    const storage = memoryStorage();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) =>
      String(url).endsWith("/cart")
        ? json(receipt, 202)
        : json({
            operation_id: uuid,
            status: "processing",
            http_status: null,
            result: null,
          }),
    );
    const request = client(fetcher, storage);
    await expect(
      request("cart", z.unknown(), "PUT", { items: [] }),
    ).rejects.toMatchObject({ kind: "timeout" });
    const first = fetcher.mock.calls[0]?.[1]?.headers;
    fetcher.mockClear();
    fetcher.mockImplementation(async (url) =>
      String(url).endsWith("/cart")
        ? json(receipt, 202)
        : json({
            operation_id: uuid,
            status: "succeeded",
            http_status: 200,
            result: { ok: true },
          }),
    );
    await expect(
      request("cart", z.object({ ok: z.boolean() }), "PUT", { items: [] }),
    ).resolves.toEqual({ ok: true });
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(first);
  });
  it("returns worker validation errors without treating acceptance as success", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(receipt, 202))
      .mockResolvedValue(
        json({
          operation_id: uuid,
          status: "rejected",
          http_status: 422,
          result: { validation_error: { quantity: ["Unavailable"] } },
        }),
      );
    await expect(
      client(fetcher)("cart", z.unknown(), "PUT", {}),
    ).rejects.toMatchObject({
      validation_error: { quantity: ["Unavailable"] },
    });
  });
  it("does not submit mutations if receipt persistence fails", async () => {
    const storage = memoryStorage();
    storage.set = async () => {
      throw new Error("quota");
    };
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      client(fetcher, storage)("cart", z.unknown(), "PUT", {}),
    ).rejects.toMatchObject({ kind: "invalid_body" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("adds browser CSRF credentials only after obtaining a cookie", async () => {
    vi.stubGlobal("document", { cookie: "XSRF-TOKEN=encoded%20token" });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json({ ok: true }));
    const request = createTransport({
      shop: "fashion",
      origin: "",
      native: false,
      getToken: async () => null,
      randomUUID: () => uuid,
      storage: memoryStorage(),
      fetch: fetcher,
    });
    await request("auth/login", z.unknown(), "POST", {});
    expect(fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({
      "X-XSRF-TOKEN": "encoded token",
    });
    expect(fetcher.mock.calls[1]?.[1]?.credentials).toBe("include");
  });
});

it("never evicts pending receipts to make space for cache", async () => {
  const storage = memoryStorage();
  for (let i = 0; i < 100; i++) await storage.set(`pending.${i}`, String(i));
  await expect(storage.set("pending.new", "receipt")).rejects.toThrow();
  expect(await storage.get("pending.0")).toBe("0");
  await storage.set("pending.0", "updated");
  expect(await storage.get("pending.0")).toBe("updated");
  await storage.clear?.();
  expect(await storage.get("pending.0")).toBeNull();
});
it("evicts disposable cache only and tolerates cache quota errors", async () => {
  const storage = memoryStorage();
  for (let i = 0; i < 100; i++)
    await storage.set(`commerce.v1.${i}`, String(i));
  await storage.set("pending.new", "receipt");
  expect(await storage.get("commerce.v1.0")).toBeNull();
  storage.set = async () => {
    throw new Error("quota");
  };
  await expect(
    new Cache(storage, "public").write("large", "x".repeat(100001)),
  ).resolves.toBeUndefined();
  await expect(
    new Cache(storage, "public").write("small", 1),
  ).resolves.toBeUndefined();
});
it("reuses checkout identity after uncertain failure and clears only on success", async () => {
  const storage = memoryStorage();
  const submit = vi
    .fn()
    .mockRejectedValueOnce(new Error("timeout"))
    .mockResolvedValue({ order: { id: 1 } });
  const address = {
    name: "A",
    line1: "B",
    city: "C",
    postcode: "1",
    country: "MY" as const,
  };
  const api = { checkout: submit };
  await expect(checkout(api, storage, () => uuid, 1, address)).rejects.toThrow(
    "timeout",
  );
  await checkout(api, storage, () => "different", 1, address);
  expect(submit.mock.calls.map((call) => call[0])).toEqual([uuid, uuid]);
  expect(await storage.get("checkout.1")).toBeNull();
});
it("formats integer money and unknown failures and bounds date retry headers", () => {
  expect(money(101)).toBe("RM 1.01");
  expect(errorMessage(new Error("specific"))).toBe("specific");
  expect(errorMessage(null)).toBe("The action could not complete.");
  expect(retryDelay(0, "invalid", 0, 0)).toBe(200);
  expect(retryDelay(0, new Date(2000).toUTCString(), 0, 0)).toBe(2000);
});
