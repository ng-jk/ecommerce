import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  user: null as null | { id: number; role: string },
  params: {} as Record<string, string>,
  miniapps: {},
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@portfolio/storefront", () => ({
  useStore: () => ({ ...state, shop: "fashion" }),
}));
vi.mock("@portfolio/storefront/screens/store_shell_screen", () => ({
  useStore: () => ({ ...state, shop: "fashion" }),
}));
vi.mock("expo-router", () => ({
  router: state,
  useLocalSearchParams: () => state.params,
}));
vi.mock("@portfolio/miniapps/screens/admin_miniapps_screen", () => ({
  AdminMiniappsScreen: () => null,
}));
vi.mock("@portfolio/miniapps/screens/miniapp_create_screen", () => ({
  MiniappCreateScreen: () => null,
}));
vi.mock("@portfolio/miniapps/screens/miniapp_edit_screen", () => ({
  MiniappEditScreen: () => null,
}));
vi.mock("@portfolio/miniapps/screens/miniapps_screen", () => ({
  MiniappsScreen: () => null,
}));
vi.mock("@portfolio/miniapps/screens/miniapp_host_screen", () => ({
  MiniappHostScreen: () => null,
}));
import Admin from "../../frontend/admin/src/app/miniapps/index";
import Create from "../../frontend/admin/src/app/miniapps/create";
import Edit from "../../frontend/admin/src/app/miniapps/[id]/edit";
import FashionList from "../../frontend/fashion/src/app/miniapps/index";
import FashionHost from "../../frontend/fashion/src/app/miniapps/[id]";
import ElectronicsList from "../../frontend/electronics/src/app/miniapps/index";
import ElectronicsHost from "../../frontend/electronics/src/app/miniapps/[id]";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  state.user = null;
  state.params = {};
});
it("limits admin routes to admins and preserves installation, pagination and safe return routes", () => {
  for (const user of [null, { id: 1, role: "customer" }]) {
    state.user = user;
    expect(Admin()).toBeNull();
    expect(Create()).toBeNull();
    expect(Edit()).toBeNull();
  }
  state.user = { id: 4, role: "admin" };
  const list = Admin()!;
  expect(list.props.scope).toBe("fashion.4");
  expect(list.props.client).toBe(state.miniapps);
  list.props.onBack();
  expect(state.replace).toHaveBeenLastCalledWith("/");
  list.props.onCreate(7, 2);
  expect(state.push).toHaveBeenLastCalledWith(
    "/miniapps/create?packageId=7&page=2",
  );
  list.props.onEdit(8, 3);
  expect(state.push).toHaveBeenLastCalledWith("/miniapps/8/edit?page=3");
  for (const route of [Create, Edit]) {
    state.params = { packageId: "7", id: "8", page: "3" };
    const page = route()!;
    expect(page.props.page).toBe(3);
    expect(page.props.scope).toBe("fashion.4");
    page.props.onDone();
    expect(state.replace).toHaveBeenLastCalledWith("/miniapps");
    state.params = {};
    expect(route()!.props.page).toBe(1);
  }
});
it("scopes both storefront adapters to the actor and supplies configured or missing launch inputs", () => {
  for (const [listing, host] of [
    [FashionList, FashionHost],
    [ElectronicsList, ElectronicsHost],
  ] as const) {
    state.user = null;
    state.params = {};
    vi.stubEnv("EXPO_PUBLIC_MINIAPP_ASSET_ORIGIN", undefined);
    const list = listing();
    expect(list.props.scope).toBe("fashion.guest");
    list.props.onOpen("9");
    expect(state.push).toHaveBeenLastCalledWith("/miniapps/9");
    list.props.onBack();
    expect(state.replace).toHaveBeenLastCalledWith("/");
    const missing = host();
    expect(missing.props.id).toBe("");
    expect(missing.props.origin).toBe("");
    expect(missing.props.scope).toBe("fashion.guest");
    missing.props.onBack();
    expect(state.replace).toHaveBeenLastCalledWith("/miniapps");
    state.user = { id: 5, role: "customer" };
    state.params = { id: "9" };
    vi.stubEnv(
      "EXPO_PUBLIC_MINIAPP_ASSET_ORIGIN",
      "https://assets.example.test",
    );
    expect(listing().props.scope).toBe("fashion.5");
    const ready = host();
    expect(ready.props.scope).toBe("fashion.5");
    expect(ready.props.id).toBe("9");
    expect(ready.props.origin).toBe("https://assets.example.test");
  }
});
