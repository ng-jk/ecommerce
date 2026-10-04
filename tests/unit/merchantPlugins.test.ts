import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  pluginAvailable,
  pluginFormValues,
  createPluginClient,
} from "../../packages/merchant-plugins";

const request = vi.fn(
  async (
    path: string,
    schema: z.ZodTypeAny,
    method = "GET",
    body?: unknown,
    _receipt?: string,
    storage?: {
      get(key: string): Promise<string | null>;
      set(key: string, value: string): Promise<void>;
      remove(key: string): Promise<void>;
    },
  ) => {
    calls.push({ path, method, body });
    if (storage) {
      await storage.get("sample");
      await storage.set("sample", "pending");
      await storage.remove("sample");
    }
    if (path.includes("balance") || path.includes("credit"))
      return schema.parse({ balance: { points: 45 } });
    if (path.includes("?") || path === "admin/plugins") {
      if (method === "GET")
        return schema.parse({
          plugins: {
            data: [installation],
            meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
          },
          options: { plugin_id: { loyalty: "Loyalty" } },
        });
    }
    return schema.parse({
      plugin: installation,
      options: { plugin_id: { loyalty: "Loyalty" } },
    });
  },
);
const calls: { path: string; method: string; body: unknown }[] = [];
const installation = {
  id: 7,
  plugin_id: "loyalty",
  version: 2,
  enabled: true,
  customer_enabled: true,
  max_credit: 500,
  created_at: "2026-10-04T00:00:00Z",
  updated_at: "2026-10-04T00:00:00Z",
};
vi.mock("../../packages/api-client/services/transport", () => ({
  createTransport: () => request,
}));

describe("merchant plugin client", () => {
  it("uses scoped endpoints and versioned payloads", async () => {
    calls.length = 0;
    const keys: string[] = [];
    const client = createPluginClient({
      shop: "fashion",
      origin: "",
      native: false,
      getToken: async () => null,
      randomUUID: () => crypto.randomUUID(),
      storage: {
        get: async (key) => {
          keys.push(key);
          return null;
        },
        set: async (key) => {
          keys.push(key);
        },
        remove: async (key) => {
          keys.push(key);
        },
      },
    });
    expect((await client.list()).plugins.data).toHaveLength(1);
    await client.list(2, true);
    await client.list(3, false);
    expect((await client.detail(7)).plugin.id).toBe(7);
    await client.install(3, {
      enabled: true,
      customer_enabled: true,
      max_credit: 500,
    });
    await client.update(3, 7, 2, {
      enabled: false,
      customer_enabled: false,
      max_credit: 100,
    });
    expect((await client.balance()).balance.points).toBe(45);
    await client.credit(4, 9, 25, "Service recovery");
    expect(calls.map(({ path, method }) => `${method} ${path}`)).toEqual([
      "GET admin/plugins?page=1",
      "GET admin/plugins?page=2&enabled=1",
      "GET admin/plugins?page=3&enabled=0",
      "GET admin/plugins/7",
      "POST admin/plugins",
      "PATCH admin/plugins/7",
      "GET plugins/loyalty/balance",
      "POST admin/plugins/loyalty/credit",
    ]);
    expect(calls[5]?.body).toEqual({
      expected_version: 2,
      enabled: false,
      customer_enabled: false,
      max_credit: 100,
    });
    expect(calls[7]?.body).toEqual({
      user_id: 9,
      points: 25,
      reason: "Service recovery",
    });
    expect(keys).toEqual([
      "plugin.3.sample",
      "plugin.3.sample",
      "plugin.3.sample",
      "plugin.3.sample",
      "plugin.3.sample",
      "plugin.3.sample",
      "plugin.4.sample",
      "plugin.4.sample",
      "plugin.4.sample",
    ]);
  });
  it("rejects invalid identifiers and credit inputs", async () => {
    const client = createPluginClient({
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
    expect(() => client.list(0)).toThrow();
    expect(() => client.detail(-1)).toThrow();
    expect(() => client.list(1, "true" as never)).toThrow();
    expect(() =>
      client.install(0, {
        enabled: true,
        customer_enabled: true,
        max_credit: 1,
      }),
    ).toThrow();
    expect(() =>
      client.install(1, {
        enabled: "yes" as never,
        customer_enabled: true,
        max_credit: 1,
      }),
    ).toThrow();
    expect(() =>
      client.update(1, 7, -1, {
        enabled: true,
        customer_enabled: true,
        max_credit: 2,
      }),
    ).toThrow();
    expect(() => client.credit(1, 0, 1, "x")).toThrow();
    expect(() => client.credit(1, 1, 10001, "x")).toThrow();
    expect(() => client.credit(1, 1, 1, "")).toThrow();
  });
});
describe("plugin decisions", () => {
  it("allows only discovered actions for the current role", () => {
    const tools = JSON.parse(
      readFileSync("backend/resources/assistant-tools.json", "utf8"),
    ) as { name: string; action: string }[];
    const found = tools.find(
      (tool) => tool.action === "plugin.loyalty.balance",
    );
    expect(found?.name).toBe("loyaltyBalance");
    const action = {
      name: found?.name ?? "",
      description: "balance",
      method: "GET",
      path: "plugins/loyalty/balance",
      confirmation_required: false,
      natural_language_confirmation_required: false,
      allowed_roles: ["customer"],
      parameters: {},
    };
    expect(pluginAvailable([action], "customer")).toBe(true);
    expect(pluginAvailable([action], "admin")).toBe(false);
    expect(pluginAvailable([{ ...action, name: "other" }], "customer")).toBe(
      false,
    );
    expect(pluginAvailable([], "customer")).toBe(false);
  });
  it("validates the configured cap", () => {
    expect(pluginFormValues(true, false, "1")).toEqual({
      enabled: true,
      customer_enabled: false,
      max_credit: 1,
    });
    expect(pluginFormValues(false, true, "10000").max_credit).toBe(10000);
    for (const value of ["", "0", "1.5", "-1", "10001", "oops"])
      expect(() => pluginFormValues(true, true, value)).toThrow();
  });
});
