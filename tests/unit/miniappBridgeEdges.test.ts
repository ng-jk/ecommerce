import { runInNewContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import {
  createBridge,
  encodedSize,
  mountWebFrame,
} from "../../packages/miniapps/services/miniapps/logic/bridge";
import {
  validateInput,
  validateLaunch,
  type Launch,
} from "../../packages/miniapps/services/miniapps/logic/types";
import {
  nativeBootstrap,
  nativeReplyScript,
} from "../../packages/miniapps/services/miniapps/logic/nativeBootstrap";
import type { MiniappSDK } from "../../packages/miniapps/services/miniapps/logic/miniapp-sdk";

const launch: Launch = {
  id: "00000000-0000-4000-8000-000000000001",
  entry_url: `https://miniapps.example.test/miniapp-assets/${"a".repeat(64)}/index.html`,
  origin: "https://miniapps.example.test",
  digest: "a".repeat(64),
  expires_at: "2099-01-01T00:00:00Z",
  capabilities: ["catalog"],
};
const request = (id: string) => ({
  type: "miniapp.request",
  session: launch.id,
  id,
  capability: "catalog",
  input: {},
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("counts UTF-8 bytes and fails closed for circular/nonserializable messages", async () => {
  expect(encodedSize("é")).toBe(4);
  const cycle: { self?: unknown } = {};
  cycle.self = cycle;
  expect(encodedSize(cycle)).toBe(Infinity);
  expect(encodedSize(1n)).toBe(Infinity);
  const invoke = vi.fn().mockResolvedValue({});
  const bridge = createBridge(launch, invoke);
  const send = vi.fn();
  await bridge.receive(cycle, send);
  await bridge.receive({ unexpected: true }, send);
  expect(invoke).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

it("caps parallel calls and suppresses a rejection arriving after channel teardown", async () => {
  let rejectPending: (error: Error) => void = () => {};
  const pending = new Promise<unknown>((_resolve, reject) => {
    rejectPending = reject;
  });
  const invoke = vi.fn().mockReturnValue(pending);
  const bridge = createBridge(launch, invoke);
  const send = vi.fn();
  const calls = Array.from({ length: 4 }, (_, index) =>
    bridge.receive(request(`pending${index}`), send),
  );
  await bridge.receive(request("overflow"), send);
  expect(invoke).toHaveBeenCalledTimes(4);
  expect(send).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ ok: false, error: "Capability unavailable" }),
  );
  bridge.close();
  rejectPending(new Error("Secret failure detail"));
  await Promise.all(calls);
  expect(send).toHaveBeenCalledTimes(1);
});

it("validates complete origin, URL, package and expiry boundaries", () => {
  for (const hostname of ["localhost", "store.localhost"]) {
    const local = `http://${hostname}:8080`;
    expect(
      validateLaunch(
        {
          ...launch,
          origin: local,
          entry_url: launch.entry_url.replace(launch.origin, local),
        },
        local,
      ),
    ).toMatchObject({ origin: local });
  }
  const invalid: [Partial<Launch>, string][] = [
    [{ origin: "https://evil.test" }, launch.origin],
    [
      {
        origin: "http://miniapps.example.test",
        entry_url: launch.entry_url.replace("https:", "http:"),
      },
      "http://miniapps.example.test",
    ],
    [
      {
        origin: "ftp://localhost",
        entry_url: launch.entry_url.replace(launch.origin, "ftp://localhost"),
      },
      "ftp://localhost",
    ],
    [{ digest: "x".repeat(64) }, launch.origin],
    [{ entry_url: `${launch.origin}/other/index.html` }, launch.origin],
    [
      { entry_url: launch.entry_url.replace("https://", "https://user@") },
      launch.origin,
    ],
    [
      { entry_url: launch.entry_url.replace("https://", "https://:secret@") },
      launch.origin,
    ],
    [{ entry_url: `${launch.entry_url}?token=bad` }, launch.origin],
    [{ entry_url: `${launch.entry_url}#bad` }, launch.origin],
  ];
  for (const [change, expected] of invalid)
    expect(() => validateLaunch({ ...launch, ...change }, expected)).toThrow(
      "origin or expiry",
    );
  expect(() =>
    validateLaunch(
      { ...launch, expires_at: new Date(1000).toISOString() },
      launch.origin,
      1000,
    ),
  ).toThrow();
  expect(validateInput("catalog", {})).toEqual({});
  expect(validateInput("catalog", { page: 100000 })).toEqual({ page: 100000 });
  expect(validateInput("product", { id: 7 })).toEqual({ id: 7 });
});

function frameEnvironment() {
  const listeners = new Set<(event: MessageEvent) => void>();
  const child = { postMessage: vi.fn() };
  const frame = {
    title: "",
    style: { width: "", height: "", border: "" },
    src: "",
    contentWindow: child as typeof child | null,
    onload: null as (() => void) | null,
    setAttribute: vi.fn(),
    remove: vi.fn(),
  };
  const container = { appendChild: vi.fn() };
  class Port {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    postMessage = vi.fn();
    close = vi.fn();
  }
  class Channel {
    port1 = new Port();
    port2 = new Port();
    constructor() {
      channels.push(this);
    }
  }
  const channels: Channel[] = [];
  vi.stubGlobal("MessageChannel", Channel);
  vi.stubGlobal("document", { createElement: () => frame });
  vi.stubGlobal("window", {
    location: { origin: "https://shop.test" },
    addEventListener: (
      _name: string,
      listener: (event: MessageEvent) => void,
    ) => listeners.add(listener),
    removeEventListener: (
      _name: string,
      listener: (event: MessageEvent) => void,
    ) => listeners.delete(listener),
  });
  const invoke = vi.fn().mockResolvedValue({ safe: true });
  function mount(expiry = launch.expires_at, expected = launch.origin) {
    const dispose = mountWebFrame(
      container as unknown as HTMLElement,
      { ...launch, expires_at: expiry },
      expected,
      invoke,
    );
    const listener = [...listeners][0];
    const channel = channels[0];
    if (!listener || !channel) throw new Error("Host did not create bridge");
    return { dispose, channel, listener };
  }
  const event = (
    data: unknown,
    source: unknown = frame.contentWindow,
    origin = "null",
  ) => ({ data, source, origin }) as MessageEvent;
  return { frame, child, container, listeners, invoke, mount, event };
}

it("ignores malformed iframe handshakes, serves channel requests, and closes replacement documents", async () => {
  const host = frameEnvironment();
  const { dispose, channel, listener } = host.mount();
  host.frame.onload?.();
  const challenge: unknown = host.child.postMessage.mock.calls[0]?.[0];
  if (!challenge || typeof challenge !== "object" || !("nonce" in challenge))
    throw new Error("Missing challenge");
  const ack = {
    type: "miniapp.ack",
    session: launch.id,
    nonce: challenge.nonce,
  };
  for (const data of [
    "bad",
    null,
    {},
    { type: "x" },
    { type: "x", session: launch.id },
    { ...ack, type: "other" },
    { ...ack, session: "other" },
  ])
    listener(host.event(data));
  expect(host.child.postMessage).toHaveBeenCalledTimes(1);
  listener(host.event(ack));
  listener(host.event(ack));
  expect(host.child.postMessage).toHaveBeenCalledTimes(2);
  channel.port1.onmessage?.({ data: request("forward") });
  await Promise.resolve();
  expect(channel.port1.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ ok: true, result: { safe: true } }),
  );
  host.frame.onload?.();
  expect(host.frame.remove).toHaveBeenCalledOnce();
  expect(channel.port1.close).toHaveBeenCalledOnce();
  dispose();
  expect(host.listeners.size).toBe(0);
});

it("stops an iframe at expiry and clears a live expiry timer on manual disposal", async () => {
  vi.useFakeTimers();
  const host = frameEnvironment();
  const { dispose, channel } = host.mount(
    new Date(Date.now() + 1000).toISOString(),
  );
  await vi.advanceTimersByTimeAsync(1000);
  expect(host.frame.remove).toHaveBeenCalledOnce();
  channel.port1.onmessage?.({ data: request("expired") });
  expect(host.invoke).not.toHaveBeenCalled();
  dispose();
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["detached", "empty-url", "foreign-url"])(
  "does not bootstrap an unavailable frame: %s",
  (state) => {
    const host = frameEnvironment();
    const { dispose } = host.mount();
    if (state === "detached") host.frame.contentWindow = null;
    if (state === "empty-url") host.frame.src = "";
    if (state === "foreign-url") host.frame.src = "https://evil.test";
    host.frame.onload?.();
    expect(host.child.postMessage).not.toHaveBeenCalled();
    dispose();
  },
);

it.each(["invalid-date", new Date(0).toISOString()])(
  "never mounts or bootstraps an invalidated launch: %s",
  (expires_at) => {
    const host = frameEnvironment();
    const dispose = mountWebFrame(
      host.container as unknown as HTMLElement,
      { ...launch, expires_at },
      launch.origin,
      host.invoke,
    );
    expect(host.container.appendChild).not.toHaveBeenCalled();
    expect(host.listeners.size).toBe(0);
    expect(host.frame.onload).toBeNull();
    dispose();
  },
);

it("handles a frame disappearing while its initialization acknowledgement is processed", () => {
  const host = frameEnvironment();
  const { listener, dispose } = host.mount();
  host.frame.onload?.();
  const challenge: unknown = host.child.postMessage.mock.calls[0]?.[0];
  if (!challenge || typeof challenge !== "object" || !("nonce" in challenge))
    throw new Error("Missing challenge");
  const ack = {
    type: "miniapp.ack",
    session: launch.id,
    get nonce() {
      host.frame.contentWindow = null;
      return challenge.nonce;
    },
  };
  listener(host.event(ack));
  expect(host.child.postMessage).toHaveBeenCalledTimes(1);
  dispose();
});

it("native generated SDK validates replies, all helpers, errors, concurrency and deadlines", async () => {
  vi.useFakeTimers();
  const messages: { id: string; capability: string; input: unknown }[] = [];
  let response: (event: { detail: unknown }) => void = () => {};
  let sdk: MiniappSDK | undefined;
  const page = {
    ReactNativeWebView: {
      postMessage: (raw: string) =>
        messages.push(
          JSON.parse(raw) as { id: string; capability: string; input: unknown },
        ),
    },
    addEventListener: (_name: string, callback: typeof response) => {
      response = callback;
    },
    dispatchEvent: (event: { detail: unknown }) => response(event),
    get MiniappSDK() {
      return sdk;
    },
    set MiniappSDK(value: MiniappSDK | undefined) {
      sdk = value;
    },
  };
  let counter = 0;
  const context = {
    window: page,
    crypto: { randomUUID: () => `id-${counter++}` },
    setTimeout,
    clearTimeout,
    CustomEvent: class {
      constructor(
        public type: string,
        public detailObject: { detail: unknown },
      ) {}
      get detail() {
        return this.detailObject.detail;
      }
    },
  };
  runInNewContext(
    nativeBootstrap({
      ...launch,
      capabilities: [
        "catalog",
        "product",
        "cart.read",
        "orders",
        "plugin.loyalty.balance",
      ],
    }),
    context,
  );
  if (!sdk) throw new Error("Native SDK was not initialized");
  const current = sdk;
  const helpers = [
    () => current.catalog(),
    () => current.catalog(2),
    () => current.product(7),
    () => current.cart(),
    () => current.orders(),
    () => current.loyaltyBalance(),
    () => current.request("catalog"),
  ];
  for (const call of helpers) {
    const answer = call();
    const last = messages.at(-1);
    response({ detail: null });
    response({ detail: { session: "wrong" } });
    response({ detail: { session: launch.id, id: "missing" } });
    runInNewContext(
      nativeReplyScript({
        session: launch.id,
        id: last?.id,
        ok: true,
        result: "');globalThis.exfiltrated=true;//",
      }),
      context,
    );
    await expect(answer).resolves.toBe("');globalThis.exfiltrated=true;//");
    expect(runInNewContext("typeof globalThis.exfiltrated", context)).toBe(
      "undefined",
    );
  }
  for (const error of ["Denied", ""]) {
    const answer = current.cart();
    response({
      detail: { session: launch.id, id: messages.at(-1)?.id, ok: false, error },
    });
    await expect(answer).rejects.toThrow(error || "Request failed");
  }
  const pending = Array.from({ length: 4 }, () => current.cart());
  const assertions = pending.map((value) =>
    expect(value).rejects.toThrow("Request timed out"),
  );
  await expect(current.cart()).rejects.toThrow("Too many requests");
  await vi.advanceTimersByTimeAsync(15000);
  await Promise.all(assertions);
  expect(messages.map((message) => message.capability)).toContain(
    "plugin.loyalty.balance",
  );
  expect(messages[0]?.input).toEqual({ page: 1 });
});
