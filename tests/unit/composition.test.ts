// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { memoryStorage } from "../../packages/api-client/data/cache";
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const state = vi.hoisted(() => ({
  OS: "web",
  create: vi.fn(),
  uuid: vi.fn(() => "uuid"),
  replace: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: state }));
vi.mock("expo-crypto", () => ({ randomUUID: state.uuid }));
vi.mock("expo-router", () => ({
  Stack: () => createElement("span", {}, "Stack"),
  router: { replace: state.replace },
}));
vi.mock("../../packages/api-client/data/repository", () => ({
  createClient: state.create,
}));
vi.mock("../../packages/storefront/data/storage", () => ({
  localStorageAdapter: () => storage,
}));
vi.mock("../../packages/storefront/presentation/view-models/context", () => ({
  StoreStateProvider: ({ children }: { children: ReactNode }) =>
    createElement("div", {}, children),
}));
vi.mock("@portfolio/storefront", () => ({
  StoreProvider: ({ shop, children }: { shop: string; children: ReactNode }) =>
    createElement("div", { "data-shop": shop }, children),
  Page: ({ children }: { children: ReactNode }) =>
    createElement("div", {}, children),
  Heading: ({ children }: { children: ReactNode }) =>
    createElement("h1", {}, children),
  Button: ({ title, onPress }: { title: string; onPress: () => void }) =>
    createElement("button", { onClick: onPress }, title),
}));
import { StoreProvider } from "../../packages/storefront/composition/StoreProvider";
import { AdminProvider } from "../../frontend/admin/src/composition/AdminProvider";
import { useAdminShop } from "../../frontend/admin/src/presentation/view-models/adminShop";
import FashionLayout from "../../frontend/fashion/src/app/_layout";
import ElectronicsLayout from "../../frontend/electronics/src/app/_layout";
import AdminLayout from "../../frontend/admin/src/app/_layout";
import FashionMissing from "../../frontend/fashion/src/app/+not-found";
import ElectronicsMissing from "../../frontend/electronics/src/app/+not-found";
const storage = memoryStorage();

it("composes browser/native clients with a shop-scoped token port and configured origin", async () => {
  await storage.set("token", "token-value");
  const container = document.createElement("div");
  const root = createRoot(container);
  for (const [os, origin] of [
    ["web", undefined],
    ["ios", undefined],
    ["ios", "https://api.example.test"],
  ] as const) {
    state.OS = os;
    if (origin) vi.stubEnv("EXPO_PUBLIC_API_URL", origin);
    else vi.stubEnv("EXPO_PUBLIC_API_URL", undefined);
    await act(async () => {
      root.render(
        createElement(StoreProvider, {
          key: `${os}-${origin}`,
          shop: "fashion",
          children: "Content",
        }),
      );
    });
    const options = state.create.mock.lastCall?.[0] as {
      native: boolean;
      origin: string;
      getToken: () => Promise<string | null>;
    };
    expect(options.native).toBe(os !== "web");
    expect(options.origin).toBe(
      os === "web" ? "" : (origin ?? "http://localhost:8080"),
    );
    expect(await options.getToken()).toBe("token-value");
    expect(container.textContent).toBe("Content");
  }
  vi.unstubAllEnvs();
  await act(async () => {
    root.unmount();
  });
});

it("switches admin shop in both directions and mounts each application layout", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  function Probe() {
    const value = useAdminShop();
    return createElement("button", { onClick: value.switchShop }, value.shop);
  }
  await act(async () => {
    root.render(
      createElement(AdminProvider, { children: createElement(Probe) }),
    );
  });
  expect(container.textContent).toBe("fashion");
  await act(async () => {
    container.querySelector("button")?.click();
  });
  expect(container.textContent).toBe("electronics");
  await act(async () => {
    container.querySelector("button")?.click();
  });
  expect(container.textContent).toBe("fashion");
  for (const Layout of [FashionLayout, ElectronicsLayout, AdminLayout]) {
    await act(async () => {
      root.render(createElement(Layout));
    });
    expect(container.textContent).toBe("Stack");
  }
  for (const Missing of [FashionMissing, ElectronicsMissing]) {
    await act(async () => {
      root.render(createElement(Missing));
    });
    await act(async () => {
      container.querySelector("button")?.click();
    });
    expect(state.replace).toHaveBeenLastCalledWith("/");
  }
  await act(async () => {
    root.unmount();
  });
});
