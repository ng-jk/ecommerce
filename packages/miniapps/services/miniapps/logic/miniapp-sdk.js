/* Distributable browser SDK. The bundle server must return a restrictive response CSP. */
export function createMiniappSDK(parentOrigin) {
  if (parentOrigin === undefined)
    parentOrigin = new URLSearchParams(window.location.hash.slice(1)).get(
      "miniapp_parent",
    );
  if (
    typeof parentOrigin !== "string" ||
    (!/^https:\/\//.test(parentOrigin) &&
      !/^http:\/\/[a-z0-9.-]*localhost(:[0-9]+)?$/.test(parentOrigin))
  )
    throw new Error("A trusted host origin is required");
  let port, session, capabilities;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("MiniApp host unavailable")),
      10000,
    );
    function initialized(event) {
      const message = event.data;
      if (
        event.source !== window.parent ||
        event.origin !== parentOrigin ||
        !message ||
        !/^[0-9a-f-]{36}$/i.test(message.session) ||
        !/^[0-9a-f-]{36}$/i.test(message.nonce)
      )
        return;
      if (message.type === "miniapp.challenge") {
        window.parent.postMessage(
          {
            type: "miniapp.ack",
            session: message.session,
            nonce: message.nonce,
          },
          parentOrigin,
        );
        return;
      }
      if (
        message.type !== "miniapp.init" ||
        !Array.isArray(message.capabilities) ||
        event.ports.length !== 1
      )
        return;
      window.removeEventListener("message", initialized);
      clearTimeout(timeout);
      session = message.session;
      capabilities = Object.freeze(
        message.capabilities.filter((value) =>
          [
            "catalog",
            "product",
            "cart.read",
            "orders",
            "plugin.loyalty.balance",
          ].includes(value),
        ),
      );
      port = event.ports[0];
      port.onmessage = (reply) => {
        const data = reply.data;
        if (
          !data ||
          data.type !== "miniapp.response" ||
          data.session !== session ||
          typeof data.id !== "string" ||
          !pending.has(data.id)
        )
          return;
        const item = pending.get(data.id);
        pending.delete(data.id);
        clearTimeout(item.timeout);
        if (data.ok === true) item.resolve(data.result);
        else
          item.reject(
            new Error(
              typeof data.error === "string" ? data.error : "Request failed",
            ),
          );
      };
      resolve();
    }
    window.addEventListener("message", initialized);
  });
  async function request(capability, input = {}) {
    await ready;
    if (!capabilities.includes(capability))
      throw new Error("Capability unavailable");
    if (pending.size >= 4) throw new Error("Too many requests");
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error("Request timed out"));
      }, 15000);
      pending.set(id, { resolve, reject, timeout });
      port.postMessage({
        type: "miniapp.request",
        session,
        id,
        capability,
        input,
      });
    });
  }
  return Object.freeze({
    ready,
    request,
    catalog: (page = 1) => request("catalog", { page }),
    product: (id) => request("product", { id }),
    cart: () => request("cart.read", {}),
    orders: () => request("orders", {}),
    loyaltyBalance: () => request("plugin.loyalty.balance", {}),
  });
}
