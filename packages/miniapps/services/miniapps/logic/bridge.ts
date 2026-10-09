import { z } from "zod";
import {
  capability,
  validateInput,
  type Capability,
  type Launch,
} from "./types";

const request = z
  .object({
    type: z.literal("miniapp.request"),
    session: z.string().uuid(),
    id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    capability,
    input: z.unknown(),
  })
  .strict();
export const MAX_MESSAGE_BYTES = 16384;
export function encodedSize(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Infinity;
  }
}
export type BridgeEvent =
  | {
      type: "miniapp.response";
      session: string;
      id: string;
      ok: true;
      result: unknown;
    }
  | {
      type: "miniapp.response";
      session: string;
      id: string;
      ok: false;
      error: string;
    };
export function createBridge(
  launch: Launch,
  invoke: (name: Capability, input: Record<string, number>) => Promise<unknown>,
) {
  const used = new Set<string>();
  let active = 0;
  let closed = false;
  const capabilities = new Set(launch.capabilities);
  async function receive(
    raw: unknown,
    send: (message: BridgeEvent) => void,
  ): Promise<void> {
    if (closed || encodedSize(raw) > MAX_MESSAGE_BYTES) return;
    const parsed = request.safeParse(raw);
    if (
      !parsed.success ||
      parsed.data.session !== launch.id ||
      used.has(parsed.data.id) ||
      used.size >= 256
    )
      return;
    const { id, capability: name } = parsed.data;
    used.add(id);
    if (active >= 4 || !capabilities.has(name)) {
      send({
        type: "miniapp.response",
        session: launch.id,
        id,
        ok: false,
        error: "Capability unavailable",
      });
      return;
    }
    let input: Record<string, number>;
    try {
      input = validateInput(name, parsed.data.input);
    } catch {
      send({
        type: "miniapp.response",
        session: launch.id,
        id,
        ok: false,
        error: "Invalid input",
      });
      return;
    }
    active++;
    try {
      const result = await invoke(name, input);
      if (!closed) {
        if (encodedSize(result) > 65536)
          send({
            type: "miniapp.response",
            session: launch.id,
            id,
            ok: false,
            error: "Response too large",
          });
        else
          send({
            type: "miniapp.response",
            session: launch.id,
            id,
            ok: true,
            result,
          });
      }
    } catch {
      if (!closed)
        send({
          type: "miniapp.response",
          session: launch.id,
          id,
          ok: false,
          error: "Request failed",
        });
    } finally {
      active--;
    }
  }
  return {
    receive,
    close: () => {
      closed = true;
      used.clear();
    },
  };
}

export function mountWebFrame(
  container: HTMLElement,
  launch: Launch,
  expectedOrigin: string,
  invoke: (name: Capability, input: Record<string, number>) => Promise<unknown>,
): () => void {
  const remaining = Date.parse(launch.expires_at) - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) return () => undefined;
  const iframe = document.createElement("iframe");
  iframe.title = "Merchant MiniApp";
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("referrerpolicy", "no-referrer");
  iframe.style.width = "100%";
  iframe.style.height = "70vh";
  iframe.style.border = "0";
  const bridge = createBridge(launch, invoke);
  const channel = new MessageChannel();
  const nonce = crypto.randomUUID();
  let connected = false;
  let loads = 0;
  let expiryTimer: ReturnType<typeof setTimeout> | null = null;
  channel.port1.onmessage = (event) => {
    void bridge.receive(event.data, (message) =>
      channel.port1.postMessage(message),
    );
  };
  const acknowledgement = (event: MessageEvent) => {
    if (
      connected ||
      event.source !== iframe.contentWindow ||
      event.origin !== "null"
    )
      return;
    const data: unknown = event.data;
    if (
      typeof data !== "object" ||
      data === null ||
      !("type" in data) ||
      !("session" in data) ||
      !("nonce" in data)
    )
      return;
    if (
      data.type !== "miniapp.ack" ||
      data.session !== launch.id ||
      data.nonce !== nonce
    )
      return;
    connected = true;
    iframe.contentWindow?.postMessage(
      {
        type: "miniapp.init",
        session: launch.id,
        nonce,
        capabilities: launch.capabilities,
      },
      "*",
      [channel.port2],
    );
    window.removeEventListener("message", acknowledgement);
  };
  window.addEventListener("message", acknowledgement);
  if (remaining < 2147483647)
    expiryTimer = setTimeout(() => {
      window.removeEventListener("message", acknowledgement);
      bridge.close();
      channel.port1.close();
      channel.port2.close();
      iframe.remove();
    }, remaining);
  iframe.onload = () => {
    loads++;
    if (loads > 1) {
      bridge.close();
      channel.port1.close();
      channel.port2.close();
      iframe.remove();
      return;
    }
    if (
      iframe.contentWindow &&
      iframe.src &&
      new URL(iframe.src).origin === new URL(expectedOrigin).origin
    ) {
      // The sandbox gives the child an opaque origin; authenticate its window before transferring a private port.
      iframe.contentWindow.postMessage(
        { type: "miniapp.challenge", session: launch.id, nonce },
        "*",
      );
    }
  };
  iframe.src = `${launch.entry_url}#miniapp_parent=${encodeURIComponent(window.location.origin)}`;
  container.appendChild(iframe);
  return () => {
    if (expiryTimer !== null) clearTimeout(expiryTimer);
    window.removeEventListener("message", acknowledgement);
    bridge.close();
    channel.port1.close();
    channel.port2.close();
    iframe.remove();
  };
}
