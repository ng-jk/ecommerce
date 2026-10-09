import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMiniappSDK } from "../../packages/miniapps/services/miniapps/logic/miniapp-sdk.js";

const origin = "https://shop.example.test";
const session = "00000000-0000-4000-8000-000000000001";
const nonce = "00000000-0000-4000-8000-000000000002";
type RequestMessage = {
  type: string;
  session: string;
  id: string;
  capability: string;
  input: unknown;
};
type HostEvent = {
  source: unknown;
  origin: string;
  data: unknown;
  ports: unknown[];
};

function environment() {
  const listeners = new Set<(event: HostEvent) => void>();
  const parent = {
    postMessage: vi.fn<(message: unknown, target: string) => void>(),
  };
  const page = {
    parent,
    location: { hash: "" },
    addEventListener: (_name: string, listener: (event: HostEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (
      _name: string,
      listener: (event: HostEvent) => void,
    ) => listeners.delete(listener),
  };
  const port: {
    postMessage: ReturnType<typeof vi.fn<(message: RequestMessage) => void>>;
    onmessage: ((event: { data: unknown }) => void) | null;
  } = {
    postMessage: vi.fn<(message: RequestMessage) => void>(),
    onmessage: null,
  };
  vi.stubGlobal("window", page);
  function send(data: unknown, options: Partial<Omit<HostEvent, "data">> = {}) {
    for (const listener of listeners)
      listener({ source: parent, origin, ports: [port], ...options, data });
  }
  function initialize(
    capabilities: unknown = [
      "catalog",
      "product",
      "cart.read",
      "orders",
      "plugin.loyalty.balance",
    ],
    hostOrigin = origin,
  ) {
    send(
      { type: "miniapp.init", session, nonce, capabilities },
      { origin: hostOrigin },
    );
  }
  function lastRequest() {
    const request = port.postMessage.mock.calls.at(-1)?.[0];
    if (!request) throw new Error("Expected an SDK request");
    return request;
  }
  function reply(data: unknown) {
    port.onmessage?.({ data });
  }
  function success(result: unknown) {
    reply({
      type: "miniapp.response",
      session,
      id: lastRequest().id,
      ok: true,
      result,
    });
  }
  return {
    page,
    parent,
    port,
    listeners,
    send,
    initialize,
    lastRequest,
    reply,
    success,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("rejects absent, non-string and untrusted origins, and accepts explicit HTTPS or local HTTP", async () => {
  const host = environment();
  expect(() => createMiniappSDK()).toThrow("trusted host origin");
  expect(() => createMiniappSDK(null as unknown as string)).toThrow(
    "trusted host origin",
  );
  for (const invalid of ["", "http://evil.test", "javascript:alert(1)"]) {
    expect(() => createMiniappSDK(invalid)).toThrow("trusted host origin");
  }
  for (const allowed of [
    origin,
    "http://localhost",
    "http://store.localhost:8080",
  ]) {
    const sdk = createMiniappSDK(allowed);
    host.initialize([], allowed);
    await sdk.ready;
    expect(Object.isFrozen(sdk)).toBe(true);
  }
  host.page.location.hash = `#miniapp_parent=${encodeURIComponent(origin)}`;
  const fromFragment = createMiniappSDK();
  host.initialize();
  await fromFragment.ready;
  expect(host.listeners.size).toBe(0);
});

it("ignores forged bootstrap messages and malformed ports before accepting one private channel", async () => {
  const host = environment();
  const sdk = createMiniappSDK(origin);
  const challenge = { type: "miniapp.challenge", session, nonce };
  host.send(challenge, { source: {} });
  host.send(challenge, { origin: "https://evil.test" });
  host.send(null);
  host.send({ ...challenge, session: "invalid" });
  host.send({ ...challenge, nonce: "invalid" });
  expect(host.parent.postMessage).not.toHaveBeenCalled();
  host.send(challenge);
  expect(host.parent.postMessage).toHaveBeenCalledExactlyOnceWith(
    { type: "miniapp.ack", session, nonce },
    origin,
  );
  host.send({ ...challenge, type: "unknown" });
  host.initialize("catalog");
  host.send(
    { type: "miniapp.init", session, nonce, capabilities: ["catalog"] },
    { ports: [] },
  );
  host.send(
    { type: "miniapp.init", session, nonce, capabilities: ["catalog"] },
    { ports: [host.port, host.port] },
  );
  expect(host.port.onmessage).toBeNull();
  expect(host.listeners.size).toBe(1);
  host.initialize(["catalog", "unknown", 7]);
  await sdk.ready;
  expect(host.listeners.size).toBe(0);
  await expect(sdk.orders()).rejects.toThrow("Capability unavailable");
  await expect(sdk.loyaltyBalance()).rejects.toThrow("Capability unavailable");
  expect(host.port.postMessage).not.toHaveBeenCalled();
});

it("exposes all five capability helpers, defaults and explicit input without adding authority", async () => {
  const host = environment();
  const sdk = createMiniappSDK(origin);
  host.initialize();
  await sdk.ready;
  const calls: {
    invoke: () => Promise<unknown>;
    capability: string;
    input: unknown;
  }[] = [
    { invoke: () => sdk.catalog(), capability: "catalog", input: { page: 1 } },
    { invoke: () => sdk.catalog(2), capability: "catalog", input: { page: 2 } },
    { invoke: () => sdk.product(12), capability: "product", input: { id: 12 } },
    { invoke: () => sdk.cart(), capability: "cart.read", input: {} },
    { invoke: () => sdk.orders(), capability: "orders", input: {} },
    {
      invoke: () => sdk.loyaltyBalance(),
      capability: "plugin.loyalty.balance",
      input: {},
    },
    { invoke: () => sdk.request("catalog"), capability: "catalog", input: {} },
    {
      invoke: () => sdk.request("product", { id: 9 }),
      capability: "product",
      input: { id: 9 },
    },
  ];
  for (const [index, call] of calls.entries()) {
    const result = call.invoke();
    await Promise.resolve();
    expect(host.lastRequest()).toMatchObject({
      type: "miniapp.request",
      session,
      capability: call.capability,
      input: call.input,
    });
    host.success({ index });
    await expect(result).resolves.toEqual({ index });
  }
  expect(
    new Set(host.port.postMessage.mock.calls.map(([message]) => message.id))
      .size,
  ).toBe(calls.length);
});

it("does not settle requests from forged replies, and safely handles explicit and malformed errors", async () => {
  const host = environment();
  const sdk = createMiniappSDK(origin);
  host.initialize();
  const answer = sdk.catalog(2);
  const settled = vi.fn();
  void answer.then(settled);
  await Promise.resolve();
  const valid = {
    type: "miniapp.response",
    session,
    id: host.lastRequest().id,
    ok: true,
    result: { products: [] },
  };
  for (const forged of [
    null,
    { ...valid, type: "other" },
    { ...valid, session: nonce },
    { ...valid, id: 7 },
    { ...valid, id: "unknown" },
  ]) {
    host.reply(forged);
  }
  await Promise.resolve();
  expect(settled).not.toHaveBeenCalled();
  host.reply(valid);
  await expect(answer).resolves.toEqual({ products: [] });
  host.reply(valid);
  expect(settled).toHaveBeenCalledOnce();
  for (const [error, message] of [
    ["Denied", "Denied"],
    [null, "Request failed"],
  ] as const) {
    const rejected = sdk.cart();
    const assertion = expect(rejected).rejects.toThrow(message);
    await Promise.resolve();
    host.reply({
      type: "miniapp.response",
      session,
      id: host.lastRequest().id,
      ok: false,
      error,
    });
    await assertion;
  }
});

it("bounds outstanding requests, times them out, and permits new work after expiry", async () => {
  const host = environment();
  const sdk = createMiniappSDK(origin);
  host.initialize();
  const pending = Array.from({ length: 4 }, () => sdk.catalog());
  const assertions = pending.map((result) =>
    expect(result).rejects.toThrow("Request timed out"),
  );
  await expect(sdk.catalog()).rejects.toThrow("Too many requests");
  expect(host.port.postMessage).toHaveBeenCalledTimes(4);
  await vi.advanceTimersByTimeAsync(15000);
  await Promise.all(assertions);
  const next = sdk.orders();
  await Promise.resolve();
  host.success({ orders: [] });
  await expect(next).resolves.toEqual({ orders: [] });
  expect(host.port.postMessage).toHaveBeenCalledTimes(5);
});

it("rejects readiness and queued requests when the host misses the bootstrap deadline", async () => {
  environment();
  const sdk = createMiniappSDK(origin);
  const ready = expect(sdk.ready).rejects.toThrow("MiniApp host unavailable");
  const queued = expect(sdk.catalog()).rejects.toThrow(
    "MiniApp host unavailable",
  );
  await vi.advanceTimersByTimeAsync(10000);
  await Promise.all([ready, queued]);
});
