// @vitest-environment jsdom
import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) => useEffect(callback, [callback]),
}));
import { usePlatformQuery } from "../../frontend/admin/src/screens/platform_workspace_screen/logic/usePlatformQuery";

it("does not load while signed out and ignores late results after route exit", async () => {
  let resolve!: (value: string) => void;
  const loader = vi.fn(
    () =>
      new Promise<string>((done) => {
        resolve = done;
      }),
  );
  let enabled = false;
  const observed: {
    latest: ReturnType<typeof usePlatformQuery<string>> | null;
  } = { latest: null };
  function Probe() {
    observed.latest = usePlatformQuery(enabled, loader);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(Probe)));
  expect(loader).not.toHaveBeenCalled();
  enabled = true;
  await act(async () => root.render(createElement(Probe)));
  expect(loader).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
  await act(async () => resolve("late"));
  expect(observed.latest?.result).toBeNull();
});

it("ignores late failures after route exit", async () => {
  let reject!: (error: Error) => void;
  const loader = () =>
    new Promise<string>((_done, fail) => {
      reject = fail;
    });
  function Probe() {
    usePlatformQuery(true, loader);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(Probe)));
  await act(async () => root.unmount());
  await act(async () => reject(new Error("late")));
});
