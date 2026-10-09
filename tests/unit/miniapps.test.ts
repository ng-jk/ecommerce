import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  createBridge,
  validateInput,
  validateLaunch,
} from "../../packages/miniapps/services/miniapps";
import { createMiniappClient } from "../../packages/miniapps";

const calls: { path: string; method: string; body: unknown }[] = [];
vi.mock("../../packages/api-client/services/transport", () => ({
  createTransport:
    () =>
    async (
      path: string,
      schema: z.ZodTypeAny,
      method = "GET",
      body?: unknown,
    ) => {
      calls.push({ path, method, body });
      const row = {
        id: 3,
        package_id: 4,
        slug: "sample",
        name: "Sample",
        visibility: "public",
        version: "1.0.0",
        digest: "a".repeat(64),
        enabled: true,
        capabilities: ["catalog", "product", "cart.read", "orders"],
        grants: ["catalog"],
        config_version: 2,
      };
      const meta = { current_page: 1, last_page: 1, per_page: 20, total: 1 };
      if (path.includes("/launch"))
        return schema.parse({ launch: launchFixture });
      if (path.includes("/invoke"))
        return schema.parse({ response: { products: [] } });
      if (path.startsWith("admin/miniapps") && method === "GET")
        return schema.parse({
          miniapps: { data: [row], meta },
          catalog: {
            data: [
              {
                package_id: 4,
                slug: "sample",
                name: "Sample",
                visibility: "public",
                versions: [
                  {
                    version: "1.0.0",
                    digest: "a".repeat(64),
                    capabilities: ["catalog"],
                  },
                ],
              },
            ],
            meta,
          },
        });
      if (method === "GET")
        return schema.parse({ miniapps: { data: [row], meta } });
      return schema.parse({ miniapp: row });
    },
}));

const launchFixture = {
  id: "00000000-0000-4000-8000-000000000001",
  entry_url: `https://miniapps.example.test/miniapp-assets/${"a".repeat(64)}/index.html`,
  origin: "https://miniapps.example.test",
  digest: "a".repeat(64),
  expires_at: "2099-01-01T00:00:00Z",
  capabilities: ["catalog"] as "catalog"[],
};

describe("MiniApp client and bridge", () => {
  it("uses bounded operation endpoints and versioned admin updates", async () => {
    calls.length = 0;
    const client = createMiniappClient({
      shop: "fashion",
      origin: "",
      native: false,
      getToken: async () => null,
      randomUUID: () => crypto.randomUUID(),
      storage: {
        get: async () => null,
        set: async () => {},
        remove: async () => {},
      },
    });
    expect((await client.list()).miniapps.data[0]?.id).toBe(3);
    expect((await client.launch("3")).launch.id).toBe(launchFixture.id);
    expect(
      (await client.invoke("3", launchFixture.id, "catalog", { page: 2 }))
        .response,
    ).toEqual({ products: [] });
    expect((await client.adminList()).catalog.data[0]?.package_id).toBe(4);
    await client.install("4", "1.0.0", true, ["catalog"]);
    await client.update("3", 2, false, []);
    client.reset();
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "GET miniapps?page=1",
      "POST miniapps/3/launch",
      "POST miniapps/3/invoke",
      "GET admin/miniapps?page=1",
      "POST admin/miniapps",
      "PATCH admin/miniapps/3",
    ]);
    expect(calls[2]?.body).toEqual({
      launch_id: launchFixture.id,
      capability: "catalog",
      input: { page: 2 },
    });
    expect(calls[5]?.body).toEqual({
      expected_version: 2,
      enabled: false,
      grants: [],
    });
    expect(() =>
      client.invoke("3", launchFixture.id, "orders", { other: 1 }),
    ).toThrow();
    expect(() =>
      client.invoke("bad", launchFixture.id, "catalog", {}),
    ).toThrow();
    expect(() => client.list(100001)).toThrow();
    await client.install("4", undefined, false);
  });
  it("rejects unexpected origins, expired launches, and unbounded input", () => {
    expect(validateLaunch(launchFixture, launchFixture.origin).id).toBe(
      launchFixture.id,
    );
    expect(() =>
      validateLaunch(
        { ...launchFixture, entry_url: "https://evil.test/app.html" },
        launchFixture.origin,
      ),
    ).toThrow();
    expect(() =>
      validateLaunch(
        { ...launchFixture, expires_at: "2000-01-01T00:00:00Z" },
        launchFixture.origin,
      ),
    ).toThrow();
    expect(() =>
      validateLaunch(
        { ...launchFixture, expires_at: "not-a-date" },
        launchFixture.origin,
      ),
    ).toThrow();
    expect(() => validateInput("catalog", { per_page: 99 })).toThrow();
    expect(() => validateInput("product", { id: -1 })).toThrow();
    expect(validateInput("plugin.loyalty.balance", {})).toEqual({});
    expect(() =>
      validateInput("plugin.loyalty.balance", { user_id: 2 }),
    ).toThrow();
  });
  it("rejects forged sessions, malformed messages, duplicate requests and removed grants", async () => {
    const invoke = vi.fn().mockResolvedValue({ items: [] });
    const bridge = createBridge(launchFixture, invoke);
    const sent: unknown[] = [];
    const send = (value: unknown) => sent.push(value);
    const request = {
      type: "miniapp.request",
      session: launchFixture.id,
      id: "one",
      capability: "catalog",
      input: { page: 1 },
    };
    await bridge.receive(
      { ...request, session: "00000000-0000-4000-8000-000000000002" },
      send,
    );
    await bridge.receive(
      { ...request, id: "bad", input: { page: 1, extra: 1 } },
      send,
    );
    await bridge.receive({ ...request, id: "two", capability: "orders" }, send);
    await bridge.receive(request, send);
    await bridge.receive(request, send);
    await bridge.receive("x".repeat(20000), send);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(3);
    bridge.close();
    await bridge.receive({ ...request, id: "three" }, send);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it("bounds response size, reports failures safely, and suppresses late responses after teardown", async () => {
    const sent: unknown[] = [];
    const send = (value: unknown) => sent.push(value);
    const request = (id: string) => ({
      type: "miniapp.request",
      session: launchFixture.id,
      id,
      capability: "catalog",
      input: {},
    });
    const bridge = createBridge(
      launchFixture,
      vi.fn().mockRejectedValue(new Error("private detail")),
    );
    await bridge.receive(request("failure"), send);
    expect(sent[0]).toMatchObject({ ok: false, error: "Request failed" });
    const large = createBridge(
      launchFixture,
      vi.fn().mockResolvedValue("x".repeat(70000)),
    );
    await large.receive(request("large"), send);
    expect(sent[1]).toMatchObject({ ok: false, error: "Response too large" });
    let resolve!: (value: unknown) => void;
    const pending = new Promise<unknown>((yes) => {
      resolve = yes;
    });
    const closing = createBridge(
      launchFixture,
      vi.fn().mockReturnValue(pending),
    );
    const handling = closing.receive(request("late"), send);
    closing.close();
    resolve({ safe: true });
    await handling;
    expect(sent).toHaveLength(2);
    const capped = createBridge(launchFixture, vi.fn().mockResolvedValue({}));
    for (let i = 0; i < 257; i++) await capped.receive(request(`id${i}`), send);
    expect(sent).toHaveLength(258);
  });
  it("SDK accepts only its parent origin and answers over the transferred port", async () => {
    const source = readFileSync(
      "packages/miniapps/services/miniapps/logic/miniapp-sdk.js",
      "utf8",
    ).replace("export function createMiniappSDK", "function createMiniappSDK");
    let listener: (event: unknown) => void = () => {};
    const parent = { postMessage: vi.fn() };
    const port = { postMessage: vi.fn(), onmessage: (_: unknown) => {} };
    const window = {
      parent,
      addEventListener: (_name: string, callback: (event: unknown) => void) => {
        listener = callback;
      },
      removeEventListener: vi.fn(),
    };
    const sdk = runInNewContext(`${source}\ncreateMiniappSDK`, {
      window,
      crypto: { randomUUID: () => "request-1" },
      setTimeout,
      clearTimeout,
      Promise,
      Map,
      Error,
      Object,
      Array,
    }) as (origin: string) => {
      ready: Promise<void>;
      catalog: (page: number) => Promise<unknown>;
    };
    const instance = sdk("https://shop.example.test");
    listener({
      source: parent,
      origin: "https://evil.test",
      data: {
        type: "miniapp.challenge",
        session: launchFixture.id,
        nonce: launchFixture.id,
      },
      ports: [],
    });
    expect(parent.postMessage).not.toHaveBeenCalled();
    listener({
      source: parent,
      origin: "https://shop.example.test",
      data: {
        type: "miniapp.challenge",
        session: launchFixture.id,
        nonce: launchFixture.id,
      },
      ports: [],
    });
    expect(parent.postMessage).toHaveBeenCalledOnce();
    listener({
      source: parent,
      origin: "https://shop.example.test",
      data: {
        type: "miniapp.init",
        session: launchFixture.id,
        nonce: launchFixture.id,
        capabilities: ["catalog"],
      },
      ports: [port],
    });
    await instance.ready;
    const result = instance.catalog(2);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(port.postMessage).toHaveBeenCalledWith({
      type: "miniapp.request",
      session: launchFixture.id,
      id: "request-1",
      capability: "catalog",
      input: { page: 2 },
    });
    port.onmessage({
      data: {
        type: "miniapp.response",
        session: launchFixture.id,
        id: "request-1",
        ok: true,
        result: { products: [] },
      },
    });
    await expect(result).resolves.toEqual({ products: [] });
  });
});
