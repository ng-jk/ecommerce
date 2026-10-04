// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  CartLine,
  Product,
  User,
} from "../../packages/api-client/services/contracts/logic/types";
import { mountHook, deferred } from "./reactHarness";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    router: navigation,
    useLocalSearchParams: () => ({ id: "1" }),
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]),
  };
});
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: 900 }),
}));
vi.mock("../../packages/storefront/screens/store_shell_screen", () => ({
  useStore: () => store,
}));
vi.mock("@portfolio/storefront", () => ({ useStore: () => store }));
import { useHome } from "../../packages/storefront/screens/home_screen/logic/useHome";
import { useProduct } from "../../packages/storefront/screens/product_screen/logic/useProduct";
import { useCart } from "../../packages/storefront/screens/cart_screen/logic/useCart";
import { useCheckout } from "../../packages/storefront/screens/checkout_screen/logic/useCheckout";
import { useOrders } from "../../packages/storefront/screens/orders_screen/logic/useOrders";
import { useAdminProductsList as useProducts } from "../../frontend/admin/src/screens/admin_products_list_screen/logic/useAdminProductsList";
import { useAdminProductCreate as useCreateProduct } from "../../frontend/admin/src/screens/admin_product_create_screen/logic/useAdminProductCreate";
import { useAdminProductEdit as useEditProduct } from "../../frontend/admin/src/screens/admin_product_edit_screen/logic/useAdminProductEdit";

const product: Product = {
  id: 1,
  shop_id: 1,
  name: "Test",
  category: "Tests",
  description: "Test",
  image_url: "https://example.com/a.png",
  price: 100,
  stock: 10,
  active: true,
  specifications: null,
  version: 0,
};
const user: User = {
  id: 1,
  shop_id: 1,
  name: "Tester",
  email: "test@example.test",
  role: "admin",
  version: 0,
  account_status: "active",
};
const page = { data: [product], meta: { last_page: 3 } };
const store = {
  api: {
    catalog: vi
      .fn()
      .mockResolvedValue({ products: page, categories: ["Tests"] }),
    product: vi.fn().mockResolvedValue({ product }),
    orders: vi.fn().mockResolvedValue({
      orders: { data: [], meta: { last_page: 2 } },
      options: { placed: "Placed" },
    }),
    adminProducts: vi
      .fn()
      .mockResolvedValue({ products: page, options: { active: "Published" } }),
    adminProduct: vi
      .fn()
      .mockResolvedValue({ product, options: { active: "Published" } }),
  },
  theme: {},
  shop: "fashion",
  user: user as User | null,
  cart: [] as CartLine[],
  ready: true,
  busy: false,
  setMessage: vi.fn(),
  run: async (action: () => Promise<void>) => {
    await action();
    return true;
  },
  setCart: vi.fn().mockResolvedValue(undefined),
  refreshCart: vi.fn().mockResolvedValue(undefined),
  checkout: vi.fn().mockResolvedValue(undefined),
  defaultPaymentMethod: "",
  paymentMethods: {} as Record<string, string>,
};
beforeEach(() => {
  vi.clearAllMocks();
  store.user = user;
  store.cart = [];
  store.defaultPaymentMethod = "";
});
afterEach(() => {
  vi.useRealTimers();
});

it("loads catalog filters and pagination, exposes failure and retries", async () => {
  vi.useFakeTimers();
  const hook = await mountHook(useHome);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
  expect(hook.value.products).toEqual([product]);
  expect(hook.value.categories).toEqual(["Tests"]);
  expect(hook.value.lastPage).toBe(3);
  expect(hook.value.loading).toBe(false);
  await act(async () => {
    hook.value.setSearch("shirt");
    hook.value.setCategory("Tests");
    hook.value.setPage(2);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
  expect(store.api.catalog).toHaveBeenLastCalledWith("shirt", "Tests", 2);
  store.api.catalog.mockRejectedValueOnce(new Error("offline"));
  await act(async () => {
    hook.value.setRetry(1);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
  expect(hook.value.failed).toBe(true);
  expect(store.setMessage).toHaveBeenCalledWith("offline");
  await hook.unmount();
});

it.each([false, true])(
  "ignores a catalog result after unmount (failure=%s)",
  async (failure) => {
    vi.useFakeTimers();
    const pending = deferred<unknown>();
    store.api.catalog.mockReturnValueOnce(pending.promise);
    const hook = await mountHook(useHome);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    await hook.unmount();
    await act(async () => {
      if (failure) pending.reject(new Error("late"));
      else pending.resolve({ products: page });
    });
    expect(store.setMessage).not.toHaveBeenCalled();
  },
);

it("adds new and existing product lines and directs guests to authentication", async () => {
  const hook = await mountHook(() => useProduct("1"));
  expect(hook.value.product).toEqual(product);
  await act(async () => {
    await hook.value.add();
  });
  expect(store.setCart).toHaveBeenLastCalledWith([
    { product_id: 1, quantity: 1 },
  ]);
  store.cart = [
    { product_id: 1, quantity: 2, product },
    { product_id: 2, quantity: 1, product: null },
  ];
  await hook.rerender();
  await act(async () => {
    await hook.value.add();
  });
  expect(store.setCart).toHaveBeenLastCalledWith([
    { product_id: 2, quantity: 1 },
    { product_id: 1, quantity: 3 },
  ]);
  store.user = null;
  await hook.rerender();
  await act(async () => {
    await hook.value.add();
  });
  expect(navigation.push).toHaveBeenLastCalledWith("/account");
  await hook.unmount();
});

it("handles missing products without sending a cart mutation", async () => {
  store.api.product.mockRejectedValueOnce(new Error("missing"));
  const hook = await mountHook(() => useProduct("404"));
  expect(hook.value.product).toBeNull();
  expect(hook.value.loading).toBe(false);
  await expect(hook.value.add()).rejects.toThrow("Product is unavailable");
  expect(store.setCart).not.toHaveBeenCalled();
  await hook.unmount();
});

it.each([false, true])(
  "ignores product responses after unmount (failure=%s)",
  async (failure) => {
    const pending = deferred<unknown>();
    store.api.product.mockReturnValueOnce(pending.promise);
    const hook = await mountHook(() => useProduct("1"));
    await hook.unmount();
    await act(async () => {
      if (failure) pending.reject(new Error("late"));
      else pending.resolve({ product });
    });
    expect(store.setMessage).not.toHaveBeenCalled();
  },
);

it("refreshes a signed-in cart, computes money, changes quantities and skips guest fetches", async () => {
  store.cart = [
    { product_id: 1, quantity: 2, product },
    { product_id: 2, quantity: 4, product: null },
  ];
  const hook = await mountHook(useCart);
  expect(hook.value.subtotal).toBe(200);
  expect(store.refreshCart).toHaveBeenCalledOnce();
  await act(async () => {
    await hook.value.change(1, 3);
  });
  expect(store.setCart).toHaveBeenCalledWith([
    { product_id: 1, quantity: 3 },
    { product_id: 2, quantity: 4 },
  ]);
  store.user = null;
  await hook.rerender();
  expect(store.refreshCart).toHaveBeenCalledOnce();
  await hook.unmount();
});

it("only navigates after checkout and cart refresh succeed", async () => {
  const hook = await mountHook(useCheckout);
  await act(async () => {
    await hook.value.submit();
  });
  expect(store.checkout).toHaveBeenCalledWith(hook.value.address);
  expect(navigation.replace).toHaveBeenCalledWith("/orders");
  navigation.replace.mockClear();
  store.checkout.mockRejectedValueOnce(new Error("stock changed"));
  await expect(hook.value.submit()).rejects.toThrow("stock changed");
  expect(navigation.replace).not.toHaveBeenCalled();
  await hook.unmount();
});

it("uses the server default payment method and submits an explicitly chosen method", async () => {
  store.defaultPaymentMethod = "card";
  const hook = await mountHook(useCheckout);
  await act(async () => {
    await hook.value.submit();
  });
  expect(store.checkout).toHaveBeenLastCalledWith(hook.value.address, "card");
  await act(async () => {
    hook.value.setPaymentMethod("merchant-invoice");
  });
  await act(async () => {
    await hook.value.submit();
  });
  expect(store.checkout).toHaveBeenLastCalledWith(
    hook.value.address,
    "merchant-invoice",
  );
  await hook.unmount();
});

it("loads order pages and model labels only for authenticated users", async () => {
  const hook = await mountHook(useOrders);
  expect(hook.value.last).toBe(2);
  expect(hook.value.options).toEqual({ placed: "Placed" });
  await act(async () => {
    hook.value.setPage(2);
  });
  expect(store.api.orders).toHaveBeenLastCalledWith(2);
  store.user = null;
  await hook.rerender();
  expect(store.api.orders).toHaveBeenCalledTimes(2);
  await hook.unmount();
});

it("loads admin lists, create options and edit data; denies guest loads", async () => {
  const list = await mountHook(useProducts);
  const create = await mountHook(useCreateProduct);
  const edit = await mountHook(useEditProduct);
  expect(list.value.items).toEqual([product]);
  expect(create.value.options).toEqual({ active: "Published" });
  expect(edit.value.data?.product).toEqual(product);
  await act(async () => {
    list.value.setPage(2);
    list.value.setCategory("Tests");
  });
  expect(store.api.adminProducts).toHaveBeenLastCalledWith(2, "Tests");
  vi.clearAllMocks();
  store.user = null;
  await list.rerender();
  await create.rerender();
  await edit.rerender();
  expect(store.api.adminProducts).not.toHaveBeenCalled();
  expect(store.api.adminProduct).not.toHaveBeenCalled();
  await list.unmount();
  await create.unmount();
  await edit.unmount();
});
