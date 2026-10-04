import { expect, it, vi } from "vitest";
import {
  assistantAdapter,
  assistantReply,
} from "../../packages/api-client/services/assistant";
import { createTransport } from "../../packages/api-client/services/transport";
import { memoryStorage } from "../../packages/api-client/services/cache";
import {
  confirmTurn,
  continuation,
  displayRows,
  fieldData,
  inputFields,
  nextChoice,
} from "../../packages/storefront/services/assistant/logic/assistant";
import type { AssistantReply } from "../../packages/api-client/services/assistant/logic/types";

const id = "00000000-0000-4000-8000-000000000001";
const reply: AssistantReply = {
  status: "needs_input",
  message: "Detail required",
  available_actions: [],
  required_input: [],
};

it("binds confirmation to the returned conversation and version without resending mutable input", () => {
  expect(continuation(null)).toEqual({});
  expect(continuation(reply)).toEqual({});
  expect(continuation({ ...reply, conversation_id: id })).toEqual({});
  const review = {
    ...reply,
    status: "needs_confirmation" as const,
    conversation_id: id,
    conversation_version: 4,
  };
  expect(confirmTurn(review)).toEqual({
    conversation_id: id,
    conversation_version: 4,
    confirm: true,
  });
  for (const invalid of [
    reply,
    { ...review, conversation_id: undefined },
    { ...review, conversation_version: undefined },
  ])
    expect(() => confirmTurn(invalid)).toThrow("Review a current preview");
});

it("expands typed object controls and preserves enum metadata", () => {
  expect(
    inputFields([
      {
        field: "data.address",
        type: "object",
        properties: {
          city: { type: "string" },
          country: { type: "string", enum: ["MY", {}] },
          nested: {
            type: "object",
            properties: { postal: { type: "integer" } },
          },
        },
      },
    ]),
  ).toEqual([
    { field: "data.address.city", type: "string" },
    { field: "data.address.country", type: "string", enum: ["MY"] },
    { field: "data.address.nested.postal", type: "integer" },
  ]);
  expect(
    inputFields([
      {
        field: "data.obj",
        type: "object",
        properties: {
          status: { type: "string", options: { placed: "Placed", invalid: 3 } },
        },
      },
    ]),
  ).toEqual([
    { field: "data.obj.status", type: "string", options: { placed: "Placed" } },
  ]);
  expect(inputFields([{ field: "data.map", type: "object" }])).toHaveLength(1);
  for (const value of [null, "string", {}, { type: 1 }])
    expect(() =>
      inputFields([
        { field: "data.bad", type: "object", properties: { child: value } },
      ]),
    ).toThrow("Unsupported");
  expect(
    inputFields([
      {
        field: "data.obj",
        type: "object",
        properties: {
          child: { type: "object", properties: null, enum: "bad" },
        },
      },
    ]),
  ).toEqual([{ field: "data.obj.child", type: "object" }]);
});

it("builds nested typed inputs and rejects invalid numbers, enum values and prototype paths", () => {
  expect(
    fieldData({ field: "data.address.city", type: "string" }, "KL"),
  ).toEqual({ address: { city: "KL" } });
  expect(fieldData({ field: "quantity", type: "integer" }, "2")).toEqual({
    quantity: 2,
  });
  expect(fieldData({ field: "data.price", type: "number" }, "1.5")).toEqual({
    price: 1.5,
  });
  expect(fieldData({ field: "data.active", type: "boolean" }, "true")).toEqual({
    active: true,
  });
  expect(fieldData({ field: "data.active", type: "boolean" }, "false")).toEqual(
    { active: false },
  );
  expect(fieldData({ field: "data.items", type: "array" }, "[]")).toEqual({
    items: [],
  });
  expect(fieldData({ field: "data.map", type: "object" }, '{"x":1}')).toEqual({
    map: { x: 1 },
  });
  expect(
    fieldData({ field: "data.country", type: "string", enum: ["MY"] }, "MY"),
  ).toEqual({ country: "MY" });
  for (const text of ["", "NaN", "1.2"])
    expect(() => fieldData({ field: "data.x", type: "integer" }, text)).toThrow(
      "valid integer",
    );
  expect(() => fieldData({ field: "data.x", type: "boolean" }, "yes")).toThrow(
    "true or false",
  );
  for (const [type, text] of [
    ["array", "{}"],
    ["object", "null"],
    ["object", "1"],
    ["object", "[]"],
  ])
    expect(() => fieldData({ field: "data.x", type: type! }, text!)).toThrow(
      "valid",
    );
  expect(() =>
    fieldData({ field: "data.x", type: "string", enum: ["MY"] }, "US"),
  ).toThrow("available");
  expect(() =>
    fieldData({ field: "data.x", type: "array", enum: [] }, "[]"),
  ).toThrow("available");
  expect(() =>
    fieldData({ field: "data.__proto__.x", type: "string" }, "bad"),
  ).toThrow("Unsupported");
});

it("shows nested business results and omits credential material", () => {
  expect(nextChoice([], "")).toBe("");
  expect(nextChoice(["a", "b"], "b")).toBe("a");
  expect(displayRows(null)).toEqual([]);
  expect(displayRows(undefined)).toEqual([]);
  expect(displayRows("Done")).toEqual(["Done"]);
  expect(
    displayRows({
      order: { id: 2 },
      password: "hidden",
      token: "hidden",
      receipt_hash: "hidden",
      items: [{ name: "Shirt" }],
    }),
  ).toEqual(["order / id: 2", "items / 0 / name: Shirt"]);
});

it("requests native device tokens and adopts only authenticated native results, clearing logout state", async () => {
  const storage = memoryStorage();
  const user = {
    id: 1,
    shop_id: 1,
    name: "A",
    email: "a@example.test",
    role: "customer",
  };
  let result: Record<string, unknown> = {
    ...reply,
    status: "completed",
    executed_action: "auth.login",
    api_result: { user, token: "native-token" },
  };
  const bodies: unknown[] = [];
  const request = createTransport({
    shop: "fashion",
    origin: "",
    native: true,
    getToken: async () => null,
    randomUUID: () => id,
    storage,
    fetch: vi.fn(async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as unknown);
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    }),
  });
  const native = assistantAdapter(request, storage, () => id, true);
  await native({ action: "login" });
  expect(bodies[0]).toEqual({
    action: "login",
    data: { device_name: "Expo assistant" },
  });
  expect(await storage.get("token")).toBe("native-token");
  await native({ action: "register", data: { name: "A" } });
  expect(bodies[1]).toEqual({
    action: "register",
    data: { name: "A", device_name: "Expo assistant" },
  });
  await native({ action: "login", confirm: true });
  expect(bodies[2]).toEqual({ action: "login", confirm: true });
  result = {
    ...result,
    executed_action: "auth.register",
    api_result: { user, token: "" },
  };
  await expect(native({ action: "catalog" })).rejects.toThrow();
  result = { ...result, api_result: { user, token: "browser-token" } };
  await storage.remove("token");
  await assistantAdapter(request, storage, () => id)({ action: "register" });
  expect(await storage.get("token")).toBeNull();
  result = { ...result, api_result: { user } };
  await native({ action: "catalog" });
  result = { ...result, executed_action: "auth.logout" };
  await native({ action: "logout" });
  expect(await storage.get("assistant.receipt.guest")).toBeNull();
  const noClear = {
    get: storage.get,
    set: storage.set,
    remove: storage.remove,
  };
  await assistantAdapter(
    request,
    noClear,
    () => id,
    true,
  )({ action: "logout" });
  result = { ...result, executed_action: "catalog" };
  await native({ action: "catalog" });
});

it("validates assistant response contracts at runtime", () => {
  expect(assistantReply.parse(reply)).toEqual(reply);
  expect(assistantReply.safeParse({ ...reply, status: "queued" }).success).toBe(
    false,
  );
  expect(
    assistantReply.safeParse({ ...reply, conversation_version: -1 }).success,
  ).toBe(false);
  expect(
    assistantReply.safeParse({
      ...reply,
      required_input: [
        {
          field: "data.address",
          type: "object",
          properties: {
            city: { type: "string" },
            nested: {
              type: "object",
              properties: { code: { type: "string" } },
            },
          },
        },
      ],
    }).success,
  ).toBe(true);
  expect(
    assistantReply.safeParse({
      ...reply,
      required_input: [
        {
          field: "data.address",
          type: "object",
          properties: { city: { type: "unsupported" } },
        },
      ],
    }).success,
  ).toBe(false);
});

it("never stores structured credentials and retains the same action identity until a response validates", async () => {
  const storage = memoryStorage();
  const writes = vi.spyOn(storage, "set");
  const keys: (string | null)[] = [];
  let count = 0;
  const uuid = () =>
    `00000000-0000-4000-8000-${String(++count).padStart(12, "0")}`;
  const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    keys.push(new Headers(init?.headers).get("Idempotency-Key"));
    return new Response(
      JSON.stringify(
        keys.length === 1
          ? {
              ...reply,
              required_input: [
                {
                  field: "data.address",
                  type: "object",
                  properties: { city: { type: "unknown" } },
                },
              ],
            }
          : reply,
      ),
      { headers: { "Content-Type": "application/json" } },
    );
  });
  const request = createTransport({
    shop: "fashion",
    origin: "",
    native: true,
    getToken: async () => null,
    randomUUID: uuid,
    storage,
    fetch: fetcher,
  });
  const assistant = assistantAdapter(request, storage, uuid, true);
  const input = {
    action: "login",
    data: {
      password: "PrivatePassword123!",
      password_confirmation: "PrivatePassword123!",
    },
  };
  await expect(assistant(input)).rejects.toMatchObject({
    kind: "invalid_body",
  });
  await assistant(input);
  expect(keys[0]).toBe(keys[1]);
  for (const write of writes.mock.calls) {
    expect(JSON.stringify(write)).not.toContain("PrivatePassword123!");
    expect(write[0]).not.toContain("password");
  }
  expect(
    writes.mock.calls.find(([key]) => key.startsWith("pending."))?.[0],
  ).toMatch(/^pending\.[a-f0-9]{64}$/);
  storage.remove = async () => {
    throw new Error("unavailable");
  };
  await expect(assistant({ discover: true })).resolves.toMatchObject({
    status: "needs_input",
  });
});

it("reuses conversation receipts across turns and reloads, partitions principals, validates requests", async () => {
  const storage = memoryStorage();
  const headers: string[] = [];
  const request = createTransport({
    shop: "fashion",
    origin: "",
    native: true,
    getToken: async () => null,
    randomUUID: () => id,
    storage,
    fetch: vi.fn(async (_url, init) => {
      headers.push(new Headers(init?.headers).get("X-Operation-Token")!);
      return new Response(JSON.stringify(reply), {
        headers: { "Content-Type": "application/json" },
      });
    }),
  });
  const assistant = assistantAdapter(request, storage, () => id);
  await assistant({ discover: true });
  await assistant({ message: "Find shirts" });
  await assistantAdapter(
    request,
    storage,
    () => "00000000-0000-4000-8000-000000000002",
  )({ action: "catalog" });
  expect(new Set(headers).size).toBe(1);
  await assistant({ discover: true }, 1);
  expect(await storage.get("assistant.receipt.1")).toBe(headers[0]);
  await expect(assistant({ message: "" })).rejects.toThrow();
  await expect(assistant({}, -1)).rejects.toThrow();
  await storage.set("assistant.receipt.guest", "corrupt");
  await expect(assistant({ discover: true })).rejects.toThrow(
    "Cannot safely restore",
  );
  const unavailable = {
    ...storage,
    get: async () => {
      throw new Error("unavailable");
    },
  };
  await expect(
    assistantAdapter(request, unavailable, () => id)({}),
  ).rejects.toThrow("Restore local storage");
});
