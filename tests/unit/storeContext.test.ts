// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import {
  ApiError,
  type User,
} from "../../packages/api-client/services/contracts/logic/types";
import { memoryStorage } from "../../packages/api-client/services/cache";
import {
  StoreStateProvider,
  themes,
  useStore,
} from "../../packages/storefront/screens/store_shell_screen/interface/context";
import type { CommerceClient } from "../../packages/storefront/services/store/logic/ports";
import { AdminShopContext } from "../../frontend/admin/src/screens/admin_shell_screen/logic/shopContext";
import { useAdminShop } from "../../frontend/admin/src/screens/admin_shell_screen/logic/useAdminShop";
import { deferred, mountHook } from "./reactHarness";
import { createShopSlug, type ShopSlug } from "../../packages/api-client";
import { parseDeploymentProfile, type DeploymentProfile } from "../../packages/storefront/services/profile";
import type { StoreTheme } from "../../packages/storefront/screens/store_shell_screen/logic/context";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const user: User = {
  id: 1,
  shop_id: 1,
  name: "Test",
  email: "test@example.test",
  role: "customer",
  account_status: "active",
  version: 0,
};
const address = {
  name: "Test",
  line1: "Test",
  city: "Test",
  postcode: "10000",
  country: "MY" as const,
};
function apiFixture() {
  return {
    me: vi.fn().mockResolvedValue({ user }),
    cart: vi.fn().mockResolvedValue({ items: [] }),
    login: vi.fn().mockResolvedValue({ user, token: "native-token" }),
    register: vi.fn().mockResolvedValue({ user }),
    logout: vi.fn().mockResolvedValue(undefined),
    setCart: vi.fn().mockResolvedValue({ items: [] }),
    checkout: vi.fn().mockResolvedValue({ order: {} }),
    catalog: vi.fn(),
    product: vi.fn(),
    orders: vi.fn(),
    adminProducts: vi.fn(),
    adminProduct: vi.fn(),
    saveProduct: vi.fn(),
    deleteProduct: vi.fn(),
    adminOrders: vi.fn(),
    advanceOrder: vi.fn(),
  } satisfies CommerceClient;
}
async function mount(api = apiFixture(), storage = memoryStorage(), options: { shop?: ShopSlug; profile?: DeploymentProfile; theme?: StoreTheme } = {}) {
  let current!: ReturnType<typeof useStore>;
  function Probe() {
    current = useStore();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => {
    root.render(
      createElement(StoreStateProvider, {
        shop: options.shop ?? "fashion",
        ...options,
        api,
        plugins: {
          list: vi.fn(), detail: vi.fn(), install: vi.fn(), update: vi.fn(),
          balance: vi.fn(), credit: vi.fn(),
        },
        miniapps: {
          list: vi.fn(), launch: vi.fn(), invoke: vi.fn(), adminList: vi.fn(), install: vi.fn(), update: vi.fn(), reset: vi.fn(),
        },
        storage,
        randomUUID: () => "00000000-0000-4000-8000-000000000001",
        children: createElement(Probe),
      }),
    );
  });
  return {
    api,
    storage,
    get value() {
      return current;
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
    },
  };
}

it("selects a validated company theme, built-in themes, and explicit overrides", async () => {
  const electronics = await mount(apiFixture(), memoryStorage(), { shop: "electronics" });
  expect(electronics.value.theme.brand).toBe("VOLT");
  await electronics.unmount();
  const profile = parseDeploymentProfile({
    version: 1, shop: "company-one", themeBase: "fashion",
    branding: { brand: "Company One", label: "Company", title: "Home", subtitle: "Explore",
      accent: "#123456", bg: "#ffffff", ink: "#111111", hero: "#eeeeee", image: "https://example.test/a.jpg" },
    home: { kind: "general" },
  });
  const company = await mount(apiFixture(), memoryStorage(), { shop: profile.shop, profile });
  expect(company.value.theme.brand).toBe("Company One");
  expect(company.value.profile?.shop).toBe("company-one");
  await company.unmount();
  const override = await mount(apiFixture(), memoryStorage(), { shop: "electronics", theme: themes.fashion });
  expect(override.value.theme.brand).toBe("maison.");
  await override.unmount();
  expect(() => StoreStateProvider({
    shop: createShopSlug("company-one"), api: apiFixture(), plugins: {} as never,
    miniapps: {} as never, storage: memoryStorage(), randomUUID: () => "id", children: null,
  })).toThrow("Company Shop requires a validated brand theme");
});

it("hydrates account and cart, authenticates both flows, persists token and clears logout data", async () => {
  const hook = await mount();
  expect(hook.value.ready).toBe(true);
  expect(hook.value.user).toEqual(user);
  await act(async () => {
    await hook.value.authenticate("email", "password");
  });
  expect(hook.api.login).toHaveBeenCalledWith("email", "password");
  expect(await hook.storage.get("token")).toBe("native-token");
  await act(async () => {
    await hook.value.authenticate("email", "password", "Name");
  });
  expect(hook.api.register).toHaveBeenCalledWith("Name", "email", "password");
  await act(async () => {
    await hook.value.setCart([]);
    await hook.value.checkout(address);
  });
  expect(hook.api.checkout).toHaveBeenCalledWith(
    "00000000-0000-4000-8000-000000000001",
    address,
  );
  await act(async () => {
    await hook.value.logout();
  });
  expect(hook.value.user).toBeNull();
  expect(hook.value.miniapps.reset).toHaveBeenCalledTimes(3);
  expect(hook.value.cart).toEqual([]);
  expect(await hook.storage.get("token")).toBeNull();
  await expect(hook.value.checkout(address)).rejects.toThrow("Sign in");
  await hook.unmount();
});

it.each([
  new ApiError("Sign in", 401),
  new ApiError("Forbidden", 403),
  new Error("offline"),
])(
  "initialization handles %s without confusing authentication with network failure",
  async (error) => {
    const api = apiFixture();
    api.me.mockRejectedValueOnce(error);
    const hook = await mount(api);
    expect(hook.value.ready).toBe(true);
    expect(hook.value.message).toBe(
      error instanceof ApiError && error.status === 401 ? "" : error.message,
    );
    await hook.unmount();
  },
);

it.each([false, true])(
  "ignores initialization completed after disposal (failure=%s)",
  async (failure) => {
    const api = apiFixture();
    const pending = deferred<{ user: User }>();
    api.me.mockReturnValueOnce(pending.promise);
    const hook = await mount(api);
    await hook.unmount();
    await act(async () => {
      if (failure) pending.reject(new Error("late"));
      else pending.resolve({ user });
    });
    expect(api.cart).not.toHaveBeenCalled();
  },
);

it("run publishes errors, clears revoked identities and always releases busy state", async () => {
  const hook = await mount();
  let outcome = false;
  await act(async () => {
    outcome = await hook.value.run(async () => undefined);
  });
  expect(outcome).toBe(true);
  for (const error of [
    new Error("network"),
    new ApiError("forbidden", 403),
    new ApiError("expired", 401),
  ]) {
    await act(async () => {
      outcome = await hook.value.run(async () => {
        throw error;
      });
    });
    expect(outcome).toBe(false);
    expect(hook.value.message).toBe(error.message);
    expect(hook.value.busy).toBe(false);
  }
  expect(hook.value.user).toBeNull();
  await hook.unmount();
});

it("supports storage implementations without optional clear", async () => {
  const storage = memoryStorage();
  delete storage.clear;
  const hook = await mount(apiFixture(), storage);
  await act(async () => {
    await hook.value.logout();
  });
  expect(hook.value.user).toBeNull();
  await hook.unmount();
});

it("browser authentication retains server session without storing a bearer token", async () => {
  const api = apiFixture();
  api.login.mockResolvedValueOnce({ user });
  const hook = await mount(api);
  await act(async () => {
    await hook.value.authenticate("email", "password");
  });
  expect(await hook.storage.get("token")).toBeNull();
  expect(hook.value.user).toEqual(user);
  await hook.unmount();
});

it("refreshes assistant sessions and server payment choices without hiding authorization failures", async () => {
  const api = apiFixture();
  api.cart.mockResolvedValue({
    items: [],
    payment_methods: { card: "Card" },
    default_payment_method: "card",
  });
  const hook = await mount(api);
  expect(hook.value.paymentMethods).toEqual({ card: "Card" });
  expect(hook.value.defaultPaymentMethod).toBe("card");
  await act(async () => {
    await hook.value.refreshSession();
    await hook.value.checkout(address, "card");
  });
  expect(api.checkout).toHaveBeenLastCalledWith(
    "00000000-0000-4000-8000-000000000001",
    address,
    "card",
  );
  api.cart.mockResolvedValue({
    items: [],
    payment_methods: {},
    default_payment_method: null,
  });
  await act(async () => {
    await hook.value.refreshCart();
  });
  expect(hook.value.defaultPaymentMethod).toBe("");
  api.me.mockRejectedValueOnce(new ApiError("Denied", 403, "forbidden"));
  await expect(hook.value.refreshSession()).rejects.toThrow("Denied");
  await hook.storage.set("checkout.pending", "owned-checkout");
  await hook.storage.set("token", "old-native-token");
  api.me.mockRejectedValueOnce(new ApiError("Expired", 401, "unauthenticated"));
  await act(async () => {
    await hook.value.refreshSession();
  });
  expect(hook.value.user).toBeNull();
  expect(hook.value.cart).toEqual([]);
  expect(await hook.storage.get("checkout.pending")).toBeNull();
  expect(await hook.storage.get("token")).toBeNull();
  await hook.unmount();
});

it("requires explicit providers and reads the selected admin shop", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  await expect(mountHook(useStore)).rejects.toThrow(
    "StoreProvider is required",
  );
  await expect(mountHook(useAdminShop)).rejects.toThrow(
    "AdminProvider is required",
  );
  error.mockRestore();
  const root = createRoot(document.createElement("div"));
  const switchShop = vi.fn();
  let selected: ReturnType<typeof useAdminShop> | undefined;
  function Probe() {
    selected = useAdminShop();
    return null;
  }
  await act(async () => {
    root.render(
      createElement(AdminShopContext.Provider, {
        value: { shop: "electronics", switchShop },
        children: createElement(Probe),
      }),
    );
  });
  expect(selected?.shop).toBe("electronics");
  selected?.switchShop();
  expect(switchShop).toHaveBeenCalledOnce();
  await act(async () => {
    root.unmount();
  });
});
