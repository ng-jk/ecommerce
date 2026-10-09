import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";
import {
  nativeBootstrap,
  nativeReplyScript,
} from "../../packages/miniapps/services/miniapps";

const launch = {
  id: "00000000-0000-4000-8000-000000000001",
  entry_url: `https://miniapps.example.test/miniapp-assets/${"a".repeat(64)}/index.html`,
  origin: "https://miniapps.example.test",
  digest: "a".repeat(64),
  expires_at: "2099-01-01T00:00:00Z",
  capabilities: ["catalog"] as ["catalog"],
};
it("native bootstrap only posts bounded capability requests and accepts matching replies", async () => {
  const events = new Map<string, (event: { detail: unknown }) => void>();
  const bridge = { postMessage: vi.fn() };
  const window = {
    ReactNativeWebView: bridge,
    addEventListener: (
      name: string,
      callback: (event: { detail: unknown }) => void,
    ) => events.set(name, callback),
    dispatchEvent: (event: { type: string; detail: unknown }) =>
      events.get(event.type)?.(event),
  };
  const context = {
    window,
    crypto: { randomUUID: () => "id-one" },
    setTimeout,
    clearTimeout,
    Map,
    Promise,
    Error,
    Object,
    JSON,
    CustomEvent: class {
      type: string;
      detail: unknown;
      constructor(type: string, options: { detail: unknown }) {
        this.type = type;
        this.detail = options.detail;
      }
    },
  };
  runInNewContext(nativeBootstrap(launch), context);
  const sdk = (
    window as typeof window & {
      MiniappSDK: {
        catalog: (page: number) => Promise<unknown>;
        orders: () => Promise<unknown>;
      };
    }
  ).MiniappSDK;
  await expect(sdk.orders()).rejects.toThrow("Capability unavailable");
  const result = sdk.catalog(2);
  expect(JSON.parse(bridge.postMessage.mock.calls[0]?.[0] as string)).toEqual({
    type: "miniapp.request",
    session: launch.id,
    id: "id-one",
    capability: "catalog",
    input: { page: 2 },
  });
  runInNewContext(
    nativeReplyScript({
      type: "miniapp.response",
      session: launch.id,
      id: "id-one",
      ok: true,
      result: { products: [] },
    }),
    context,
  );
  await expect(result).resolves.toEqual({ products: [] });
});
