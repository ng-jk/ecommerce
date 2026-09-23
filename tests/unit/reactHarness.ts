import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

export async function mountHook<T>(hook: () => T) {
  let current: T;
  const root = createRoot(document.createElement("div"));
  function Probe() {
    current = hook();
    return null;
  }
  await act(async () => {
    root.render(createElement(Probe));
  });
  return {
    get value() {
      return current;
    },
    async rerender() {
      await act(async () => {
        root.render(createElement(Probe));
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
    },
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
