// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ApiError, type User } from "../../packages/api-client/domain/types";
import { memoryStorage } from "../../packages/api-client/data/cache";
import {
  StoreStateProvider,
  useStore,
} from "../../packages/storefront/presentation/view-models/context";
import type { CommerceClient } from "../../packages/storefront/domain/ports";
import {
  AdminShopContext,
  useAdminShop,
} from "../../frontend/admin/src/presentation/view-models/adminShop";
import { deferred, mountHook } from "./reactHarness";

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
async function mount(api = apiFixture(), storage = memoryStorage()) {
  let current!: ReturnType<typeof useStore>;
  function Probe() {
    current = useStore();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => {
    root.render(
      createElement(StoreStateProvider, {
        shop: "fashion",
        api,
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
