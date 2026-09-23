import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { Cache, memoryStorage } from "../../packages/api-client/data/cache";
import {
  classify,
  retryDelay,
  responseError,
  createTransport,
} from "../../packages/api-client/data/transport";
const uuid = "00000000-0000-4000-8000-000000000001";
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
describe("transport", () => {
  it.each([
    [401, "unauthenticated"],
    [403, "forbidden"],
    [404, "missing"],
    [409, "conflict"],
    [422, "validation"],
    [429, "throttled"],
    [500, "server"],
    [302, "unexpected"],
    [408, "timeout"],
  ])("classifies %s", (status, kind) =>
    expect(classify(Number(status))).toBe(kind),
  );
  it("normalizes field errors", () =>
    expect(
      responseError(422, { validation_error: { email: ["Invalid"] } })
        .validation_error,
    ).toEqual({ email: ["Invalid"] }));
  it("caps retry delays", () => expect(retryDelay(99, "600")).toBe(5000));
  it("polls the durable operation and validates its result", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json(
          {
            operation_id: uuid,
            status: "queued",
            poll_url: `/api/v1/shops/fashion/operations/${uuid}`,
          },
          202,
        ),
      )
      .mockResolvedValueOnce(
        json({
          operation_id: uuid,
          status: "succeeded",
          http_status: 200,
          result: { ok: true },
        }),
      );
    const request = createTransport({
      shop: "fashion",
      origin: "https://example.test",
      native: true,
      getToken: async () => null,
      randomUUID: () => uuid,
      storage: memoryStorage(),
      fetch: fetcher,
      sleep: async () => undefined,
    });
    await expect(
      request("products", z.object({ ok: z.boolean() })),
    ).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not retry field validation failures", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        json({ validation_error: { name: ["Required"] } }, 422),
      );
    const request = createTransport({
      shop: "fashion",
      origin: "https://example.test",
      native: true,
      getToken: async () => null,
      randomUUID: () => uuid,
      storage: memoryStorage(),
      fetch: fetcher,
      sleep: async () => undefined,
    });
    await expect(request("products", z.unknown())).rejects.toMatchObject({
      kind: "validation",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("retries temporary failures and preserves the mutation key", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json({ ok: true }));
    const request = createTransport({
      shop: "fashion",
      origin: "https://example.test",
      native: true,
      getToken: async () => "token",
      randomUUID: () => uuid,
      storage: memoryStorage(),
      fetch: fetcher,
      sleep: async () => undefined,
    });
    await request("cart", z.object({ ok: z.boolean() }), "PUT", { items: [] });
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(
      fetcher.mock.calls[1]?.[1]?.headers,
    );
  });
});
it("cache expires, rejects corrupt values, and separates principals", async () => {
  const storage = memoryStorage();
  let now = 0;
  const a = new Cache(storage, "fashion.1", () => now),
    b = new Cache(storage, "fashion.2", () => now);
  await a.write("cart", { total: 1 }, 10);
  expect(await a.read("cart", z.object({ total: z.number() }))).toEqual({
    total: 1,
  });
  expect(await b.read("cart", z.unknown())).toBeNull();
  now = 11;
  expect(await a.read("cart", z.unknown())).toBeNull();
  await storage.set("commerce.v1.fashion.1.cart", "broken");
  expect(await a.read("cart", z.unknown())).toBeNull();
});

it.each([
  "http://localhost.evil.test",
  "http://127.0.0.1.evil.test",
  "https://user:password@example.test",
  "https://example.test/path",
  "ftp://localhost",
])("rejects unsafe API origin %s", (origin) => {
  expect(() =>
    createTransport({
      shop: "fashion",
      origin,
      native: true,
      getToken: async () => null,
      randomUUID: () => uuid,
      storage: memoryStorage(),
    }),
  ).toThrow();
});
it.each([
  "http://localhost:8088",
  "http://fashion.localhost:8088",
  "http://192.168.1.10:8080",
  "https://api.example.test",
])("accepts explicit API origin %s", (origin) => {
  expect(() =>
    createTransport({
      shop: "fashion",
      origin,
      native: true,
      getToken: async () => null,
      randomUUID: () => uuid,
      storage: memoryStorage(),
    }),
  ).not.toThrow();
});
