// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { expect, it, vi } from "vitest";
import type { MiniappClient } from "../../packages/miniapps";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const webview = vi.hoisted(() => ({
  props: null as null | Record<string, unknown>,
  injected: vi.fn(),
}));
vi.mock("react-native", async () => {
  const React = await import("react");
  return {
    View: ({ children }: { children?: ReactNode }) =>
      React.createElement("div", {}, children),
    Text: ({ children }: { children?: ReactNode }) =>
      React.createElement("span", {}, children),
    Pressable: ({
      children,
      onPress,
    }: {
      children?: ReactNode;
      onPress?: () => void;
    }) => React.createElement("button", { onClick: onPress }, children),
  };
});
vi.mock("react-native-webview", async () => {
  const React = await import("react");
  return {
    default: React.forwardRef((_props: Record<string, unknown>, ref) => {
      webview.props = _props;
      React.useImperativeHandle(ref, () => ({
        injectJavaScript: webview.injected,
      }));
      return React.createElement("div", { "data-testid": "webview" });
    }),
  };
});
import {
  Frame,
  MiniappHostScreen,
} from "../../packages/miniapps/screens/miniapp_host_screen/interface/MiniappHostScreen.native";

const launch = {
  id: "00000000-0000-4000-8000-000000000001",
  entry_url: `https://miniapps.example.test/miniapp-assets/${"a".repeat(64)}/index.html`,
  origin: "https://miniapps.example.test",
  digest: "a".repeat(64),
  expires_at: "2099-01-01T00:00:00Z",
  capabilities: ["catalog"] as ["catalog"],
};
it("native host constrains navigation and message URL, then closes the session on reload", async () => {
  const client = {
    launch: vi.fn(async () => ({ launch })),
    invoke: vi.fn(async () => ({ response: { products: [] } })),
  } as unknown as MiniappClient;
  const container = document.createElement("div"),
    root = createRoot(container);
  await act(async () =>
    root.render(
      createElement(MiniappHostScreen, {
        client,
        id: "3",
        scope: "fashion.1",
        origin: launch.origin,
        onBack: vi.fn(),
      }),
    ),
  );
  expect(container.querySelector("[data-testid=webview]")).not.toBeNull();
  const props = webview.props!;
  const should = props.onShouldStartLoadWithRequest as (request: {
    url: string;
  }) => boolean;
  expect(should({ url: launch.entry_url })).toBe(true);
  expect(should({ url: "https://evil.test/" })).toBe(false);
  expect(should({ url: "file:///tmp/sample" })).toBe(false);
  expect(should({ url: "not a url" })).toBe(false);
  const receive = props.onMessage as (event: {
    nativeEvent: { url: string; data: string };
  }) => void;
  const message = JSON.stringify({
    type: "miniapp.request",
    session: launch.id,
    id: "one",
    capability: "catalog",
    input: { page: 1 },
  });
  receive({ nativeEvent: { url: "https://evil.test/", data: message } });
  receive({ nativeEvent: { url: launch.entry_url, data: "x".repeat(17000) } });
  receive({ nativeEvent: { url: launch.entry_url, data: "not-json" } });
  expect(client.invoke).not.toHaveBeenCalled();
  await act(async () => {
    receive({ nativeEvent: { url: launch.entry_url, data: message } });
    await Promise.resolve();
  });
  expect(client.invoke).toHaveBeenCalledWith("3", launch.id, "catalog", {
    page: 1,
  });
  expect(webview.injected).toHaveBeenCalledOnce();
  const load = props.onLoadStart as () => void;
  await act(async () => {
    load();
    load();
  });
  expect(container.textContent).toContain("navigation ended");
  receive({ nativeEvent: { url: launch.entry_url, data: message } });
  await act(async () => root.unmount());
});

it("native frame fails closed for expired launches and closes when a launch expires", async () => {
  const client = { invoke: vi.fn() } as unknown as MiniappClient;
  const container = document.createElement("div"),
    root = createRoot(container);
  await act(async () =>
    root.render(
      createElement(Frame, {
        client,
        id: "3",
        launch: { ...launch, expires_at: "2000-01-01T00:00:00Z" },
        origin: launch.origin,
      }),
    ),
  );
  expect(container.textContent).toContain("navigation ended");
  await act(async () => root.unmount());
  vi.useFakeTimers();
  const second = document.createElement("div"),
    secondRoot = createRoot(second);
  const near = {
    ...launch,
    expires_at: new Date(Date.now() + 500).toISOString(),
  };
  await act(async () =>
    secondRoot.render(
      createElement(Frame, {
        client,
        id: "3",
        launch: near,
        origin: launch.origin,
      }),
    ),
  );
  expect(second.querySelector("[data-testid=webview]")).not.toBeNull();
  await act(async () => {
    vi.advanceTimersByTime(600);
  });
  expect(second.textContent).toContain("navigation ended");
  await act(async () => secondRoot.unmount());
  vi.useRealTimers();
});

it("native launch failure stays outside the WebView", async () => {
  const client = {
    launch: vi.fn().mockRejectedValue(new Error("offline")),
  } as unknown as MiniappClient;
  const container = document.createElement("div"),
    root = createRoot(container);
  await act(async () =>
    root.render(
      createElement(MiniappHostScreen, {
        client,
        id: "3",
        scope: "fashion.1",
        origin: launch.origin,
        onBack: vi.fn(),
      }),
    ),
  );
  expect(container.textContent).toContain("could not be launched");
  expect(container.querySelector("[data-testid=webview]")).toBeNull();
  await act(async () => root.unmount());
});

it.each(["2000-01-01T00:00:00Z", "2099-01-01T00:00:00Z"])(
  "does not advance a native launch after unmount (%s)",
  async (expires_at) => {
    const client = { invoke: vi.fn() } as unknown as MiniappClient;
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() =>
      root.render(
        createElement(Frame, {
          client,
          id: "3",
          launch: { ...launch, expires_at },
          origin: launch.origin,
        }),
      ),
    );
    flushSync(() => root.unmount());
    await act(async () => Promise.resolve());
    expect(container.querySelector("[data-testid=webview]")).toBeNull();
  },
);
