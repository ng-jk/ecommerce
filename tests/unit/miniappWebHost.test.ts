// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountWebFrame } from "../../packages/miniapps/services/miniapps";

const launch = {
  id: "00000000-0000-4000-8000-000000000001",
  entry_url: `https://miniapps.example.test/miniapp-assets/${"a".repeat(64)}/index.html`,
  origin: "https://miniapps.example.test",
  digest: "a".repeat(64),
  expires_at: "2099-01-01T00:00:00Z",
  capabilities: ["catalog"] as ["catalog"],
};
class Port {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  postMessage = vi.fn();
  close = vi.fn();
}
class Channel {
  port1 = new Port();
  port2 = new Port();
}
const original = globalThis.MessageChannel;
afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.MessageChannel = original;
  document.body.innerHTML = "";
});
it("authenticates opaque iframe source and nonce before transferring a port, then tears down", () => {
  const channels: Channel[] = [];
  vi.stubGlobal(
    "MessageChannel",
    class extends Channel {
      constructor() {
        super();
        channels.push(this);
      }
    },
  );
  const container = document.createElement("div");
  document.body.appendChild(container);
  const dispose = mountWebFrame(container, launch, launch.origin, vi.fn());
  const iframe = container.querySelector("iframe");
  expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts");
  expect(iframe?.src).toContain("#miniapp_parent=");
  const post = vi.spyOn(iframe!.contentWindow!, "postMessage");
  iframe?.dispatchEvent(new Event("load"));
  const challenge = post.mock.calls[0]?.[0] as {
    session: string;
    nonce: string;
  };
  expect(challenge.session).toBe(launch.id);
  const ack = {
    type: "miniapp.ack",
    session: launch.id,
    nonce: challenge.nonce,
  };
  window.dispatchEvent(
    new MessageEvent("message", { origin: "null", source: window, data: ack }),
  );
  expect(post).toHaveBeenCalledTimes(1);
  window.dispatchEvent(
    new MessageEvent("message", {
      origin: "https://miniapps.example.test",
      source: iframe!.contentWindow!,
      data: ack,
    }),
  );
  expect(post).toHaveBeenCalledTimes(1);
  window.dispatchEvent(
    new MessageEvent("message", {
      origin: "null",
      source: iframe!.contentWindow!,
      data: { ...ack, nonce: "wrong" },
    }),
  );
  expect(post).toHaveBeenCalledTimes(1);
  window.dispatchEvent(
    new MessageEvent("message", {
      origin: "null",
      source: iframe!.contentWindow!,
      data: ack,
    }),
  );
  expect(post).toHaveBeenCalledTimes(2);
  expect((post.mock.calls[1] as unknown[])[2]).toEqual([channels[0]?.port2]);
  dispose();
  expect(container.querySelector("iframe")).toBeNull();
  expect(channels[0]?.port1.close).toHaveBeenCalledOnce();
});
