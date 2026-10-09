// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Platform } from "react-native";
import { ProfiledStoreProvider } from "../../packages/storefront/screens/store_shell_screen/interface/ProfiledStoreProvider";
import { CompanyHomeScreen } from "../../packages/storefront/screens/company_home_screen";
import { miniappHome } from "../../packages/storefront/screens/company_home_screen/logic/home";
import { parseDeploymentProfile } from "../../packages/storefront/services/profile";

const state = vi.hoisted(() => ({ store: null as null | Record<string, unknown>, replace: vi.fn() }));
vi.mock("react-native", () => ({
  Platform: { OS: "web" },
  View: ({ children, accessibilityLabel }: { children?: React.ReactNode; accessibilityLabel?: string }) => createElement("div", { "aria-label": accessibilityLabel }, children),
  Text: ({ children }: { children?: React.ReactNode }) => createElement("span", null, children),
}));
vi.mock("../../packages/storefront/screens/store_shell_screen/interface/StoreProvider", () => ({
  StoreProvider: ({ shop, children }: { shop: string; children: React.ReactNode }) => createElement("section", { "data-shop": shop }, children),
}));
vi.mock("../../packages/storefront/screens/store_shell_screen", () => ({ useStore: () => state.store }));
vi.mock("../../packages/storefront/screens/home_screen", () => ({ HomeScreen: () => createElement("div", null, "general home") }));
vi.mock("@portfolio/miniapps/screens/miniapp_host_screen", () => ({
  MiniappHostScreen: ({ id, scope, onBack }: { id: string; scope: string; onBack: () => void }) =>
    createElement("button", { "data-miniapp": id, "data-scope": scope, onClick: onBack }, "miniapp home"),
}));
vi.mock("expo-router", () => ({ router: { replace: state.replace } }));

const profile = {
  version: 1, shop: "company-one", themeBase: "fashion",
  branding: { brand: "Company One", label: "Company One", title: "Home", subtitle: "Explore",
    accent: "#123456", bg: "#ffffff", ink: "#111111", hero: "#eeeeee", image: "https://example.test/a.jpg" },
  home: { kind: "miniapp", installationId: 7 },
};

let node: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  (Platform as { OS: string }).OS = "web";
  state.replace.mockClear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  node.remove();
  vi.unstubAllGlobals();
  delete process.env.EXPO_PUBLIC_SHOP3I_PROFILE_JSON;
});

async function renderProvider(required = false) {
  await act(async () => root.render(createElement(ProfiledStoreProvider, {
    defaultShop: "fashion", required, children: createElement("p", null, "children"),
  })));
}

it("uses a validated runtime tenant, legacy fallback, and a closed error state", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(profile), { status: 200, headers: { "content-type": "application/json" } })));
  await renderProvider();
  expect(node.querySelector("section")?.getAttribute("data-shop")).toBe("company-one");
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
  await act(async () => root.unmount());
  root = createRoot(node);
  await renderProvider();
  expect(node.querySelector("section")?.getAttribute("data-shop")).toBe("fashion");
  await act(async () => root.unmount());
  root = createRoot(node);
  await renderProvider(true);
  expect(node.textContent).toContain("Shop profile unavailable.");
  expect(node.querySelector("section")).toBeNull();
});

it("parses native build profile and fails closed on invalid required config", async () => {
  (Platform as { OS: string }).OS = "ios";
  process.env.EXPO_PUBLIC_SHOP3I_PROFILE_JSON = JSON.stringify(profile);
  await renderProvider();
  expect(node.querySelector("section")?.getAttribute("data-shop")).toBe("company-one");
  await act(async () => root.unmount());
  root = createRoot(node);
  process.env.EXPO_PUBLIC_SHOP3I_PROFILE_JSON = "bad";
  await renderProvider(true);
  expect(node.textContent).toContain("Shop profile unavailable.");
  await act(async () => root.unmount());
  root = createRoot(node);
  delete process.env.EXPO_PUBLIC_SHOP3I_PROFILE_JSON;
  await renderProvider();
  expect(node.querySelector("section")?.getAttribute("data-shop")).toBe("fashion");
  await act(async () => root.unmount());
  root = createRoot(node);
  await renderProvider(true);
  expect(node.textContent).toContain("Shop profile unavailable.");
});

it("selects the existing Mini App host only for the configured installation", async () => {
  state.store = { profile: null, miniapps: {}, shop: "fashion", user: null };
  await act(async () => root.render(createElement(CompanyHomeScreen)));
  expect(node.textContent).toContain("general home");
  state.store = { profile: { home: { kind: "miniapp", installationId: 7 } }, miniapps: {}, shop: "company-one", user: { id: 5 } };
  await act(async () => root.render(createElement(CompanyHomeScreen)));
  const button = node.querySelector("button");
  expect(button?.getAttribute("data-miniapp")).toBe("7");
  expect(button?.getAttribute("data-scope")).toBe("company-one.5");
  await act(async () => button?.click());
  expect(state.replace).toHaveBeenCalledWith("/miniapps");
  state.store = { profile: { home: { kind: "miniapp", installationId: 7 } }, miniapps: {}, shop: "company-one", user: null };
  await act(async () => root.render(createElement(CompanyHomeScreen)));
  expect(node.querySelector("button")?.getAttribute("data-scope")).toBe("company-one.guest");
  state.store = { profile: { home: { kind: "general" } }, miniapps: {}, shop: "fashion", user: null };
  await act(async () => root.render(createElement(CompanyHomeScreen)));
  expect(node.textContent).toContain("general home");
});

it("scopes the company home to the selected Shop and uses the configured asset origin", () => {
  const parsed = parseDeploymentProfile(profile);
  process.env.EXPO_PUBLIC_MINIAPP_ASSET_ORIGIN = "https://miniapps.example.test";
  expect(miniappHome(parsed, parsed.shop, 5)).toEqual({ id: "7", scope: "company-one.5", origin: "https://miniapps.example.test" });
  expect(miniappHome(null, parsed.shop, null)).toBeNull();
  delete process.env.EXPO_PUBLIC_MINIAPP_ASSET_ORIGIN;
  expect(miniappHome(parsed, parsed.shop, null)?.origin).toBe("");
});

it("ignores late profile success and failure after unmount", async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
  await renderProvider();
  expect(node.querySelector("[aria-label='Loading Shop profile']")).not.toBeNull();
  await act(async () => root.unmount());
  resolve(new Response(JSON.stringify(profile), { status: 200, headers: { "content-type": "application/json" } }));
  await Promise.resolve();
  root = createRoot(node);
  let reject!: (error: Error) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((_done, fail) => { reject = fail; })));
  await renderProvider();
  await act(async () => root.unmount());
  reject(new Error("offline"));
  await Promise.resolve();
  root = createRoot(node);
});
