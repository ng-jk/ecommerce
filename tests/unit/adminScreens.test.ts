// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import type {
  Product,
  User,
} from "../../packages/api-client/services/contracts/logic/types";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    router,
    useLocalSearchParams: () => ({ id: "1" }),
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]),
  };
});
vi.mock("react-native", () => ({
  ScrollView: ({ children }: { children: ReactNode }) =>
    createElement("div", {}, children),
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: ReactNode }) =>
    createElement("div", {}, children),
}));
vi.mock(
  "../../frontend/admin/node_modules/react-native-safe-area-context",
  () => ({
    SafeAreaView: ({ children }: { children: ReactNode }) =>
      createElement("div", {}, children),
  }),
);
vi.mock("@portfolio/storefront", () => ({
  useStore: () => store,
  Copy: ({ children }: { children: ReactNode }) =>
    createElement("span", {}, children),
  Heading: ({ children }: { children: ReactNode }) =>
    createElement("h1", {}, children),
  Panel: ({ children }: { children: ReactNode }) =>
    createElement("div", {}, children),
  Button: ({
    title,
    onPress,
    disabled,
  }: {
    title: string;
    onPress: () => void;
    disabled?: boolean;
  }) => createElement("button", { onClick: onPress, disabled }, title),
  Field: ({
    label,
    value,
    onChangeText,
  }: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
  }) =>
    createElement("input", {
      "aria-label": label,
      value,
      onInput: (event: React.FormEvent<HTMLInputElement>) =>
        onChangeText(event.currentTarget.value),
      readOnly: false,
    }),
}));
vi.mock(
  "../../frontend/admin/src/screens/admin_shell_screen/logic/useAdminShop",
  () => ({
    useAdminShop: () => ({ shop: "fashion", switchShop }),
  }),
);
import { AdminHomeScreen as Home } from "../../frontend/admin/src/screens/admin_home_screen/interface/AdminHomeScreen";
import { AdminOrdersScreen as Orders } from "../../frontend/admin/src/screens/admin_orders_screen/interface/AdminOrdersScreen";
import { AdminProductsListScreen as Products } from "../../frontend/admin/src/screens/admin_products_list_screen/interface/AdminProductsListScreen";
import { AdminProductCreateScreen as Create } from "../../frontend/admin/src/screens/admin_product_create_screen/interface/AdminProductCreateScreen";
import { AdminProductEditScreen as Edit } from "../../frontend/admin/src/screens/admin_product_edit_screen/interface/AdminProductEditScreen";
import { ProductForm as Form } from "../../frontend/admin/src/screens/product_form_screen/interface/ProductForm";

const product: Product = {
  id: 1,
  shop_id: 1,
  name: "Coat",
  category: "Coats",
  description: "Warm",
  image_url: "https://example.com/a.png",
  price: 101,
  stock: 3,
  active: true,
  specifications: { Colour: "Blue" },
  version: 2,
};
const user: User = {
  id: 1,
  shop_id: 1,
  name: "Admin",
  email: "admin@example.test",
  role: "admin",
  version: 0,
  account_status: "active",
};
const options = { "1": "Published", "0": "Hidden" };
const switchShop = vi.fn();
const failures: unknown[] = [];
const store = {
  theme: { bg: "white" },
  message: "",
  user: user as User | null,
  busy: false,
  run: async (action: () => Promise<void>) => {
    try {
      await action();
      return true;
    } catch (error) {
      failures.push(error);
      return false;
    }
  },
  authenticate: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
  api: {
    adminProducts: vi.fn().mockResolvedValue({
      products: { data: [product], meta: { last_page: 2 } },
      options,
    }),
    adminProduct: vi.fn().mockResolvedValue({ product, options }),
    saveProduct: vi.fn().mockResolvedValue({ product }),
    deleteProduct: vi.fn().mockResolvedValue({ deleted: true }),
    adminOrders: vi.fn().mockResolvedValue({
      orders: {
        data: [
          { id: 1, total: 101, status: "placed" },
          { id: 2, total: 200, status: "unknown" },
        ],
        meta: { last_page: 2 },
      },
      options: { placed: "Placed", processing: "Processing" },
      transitions: { placed: "processing" },
    }),
    advanceOrder: vi.fn().mockResolvedValue({}),
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  failures.length = 0;
  store.user = user;
  store.message = "";
});
async function render(element: React.ReactElement) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    container,
    async press(title: string) {
      const button = [...container.querySelectorAll("button")].find(
        (item) => item.textContent === title,
      );
      expect(button, title).toBeDefined();
      await act(async () => {
        button?.click();
      });
    },
    async fill(label: string, value: string) {
      const input = container.querySelector<HTMLInputElement>(
        `input[aria-label="${label}"]`,
      );
      expect(input).not.toBeNull();
      await act(async () => {
        if (input) {
          input.value = value;
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
    },
    async rerender(next = element) {
      await act(async () => {
        root.render(next);
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
    },
  };
}

it("authenticates on a standalone dashboard and handles every role and shop switch", async () => {
  store.user = null;
  store.message = "Notice";
  const screen = await render(createElement(Home));
  expect(screen.container.textContent).toContain("Notice");
  await screen.fill("Email", "admin@example.test");
  await screen.fill("Password", "password");
  await screen.press("Sign in");
  expect(store.authenticate).toHaveBeenCalledWith(
    "admin@example.test",
    "password",
  );
  expect(
    screen.container.querySelector<HTMLInputElement>('[aria-label="Password"]')
      ?.value,
  ).toBe("");
  await screen.press("Switch shop");
  expect(store.logout).not.toHaveBeenCalled();
  store.user = user;
  store.message = "";
  await screen.rerender(createElement(Home));
  await screen.press("Products");
  await screen.press("Orders");
  await screen.press("Sign out");
  await screen.press("Switch shop");
  expect(router.push.mock.calls).toEqual([["/products"], ["/orders"]]);
  await screen.press("Assistant");
  expect(router.push).toHaveBeenLastCalledWith("/assistant");
  expect(switchShop).toHaveBeenCalledTimes(2);
  store.user = { ...user, role: "customer" };
  await screen.rerender(createElement(Home));
  expect(screen.container.textContent).toContain("Administrator access");
  await screen.press("Sign out");
  expect(store.logout).toHaveBeenCalledTimes(3);
  await screen.unmount();
});

it("uses full-page shared forms for create and edit and respects unavailable data", async () => {
  const create = await render(createElement(Create));
  expect(create.container.textContent).toContain("Add product");
  await create.unmount();
  store.user = null;
  const guest = await render(createElement(Create));
  expect(guest.container.querySelector("input")).toBeNull();
  await guest.unmount();
  const emptyEdit = await render(createElement(Edit));
  expect(emptyEdit.container.querySelector("input")).toBeNull();
  await emptyEdit.unmount();
  store.user = user;
  const edit = await render(createElement(Edit));
  expect(
    edit.container.querySelector<HTMLInputElement>('[aria-label="Name"]')
      ?.value,
  ).toBe("Coat");
  await edit.unmount();
});

it("edits both form steps, uses model labels, saves parsed cents and deletes with a version", async () => {
  const screen = await render(
    createElement(Form, { initial: product, options }),
  );
  for (const [label, value] of [
    ["Name", "New coat"],
    ["Category", "Tests"],
    ["Description", "Description"],
    ["Image URL", "https://example.com/b.png"],
  ] as const)
    await screen.fill(label, value);
  await screen.press("Next: price and inventory");
  await screen.fill("Price (MYR)", "2.05");
  await screen.fill("Stock", "4");
  await screen.fill("Specifications (Label: Value)", "Colour: Red");
  await screen.press("Hidden");
  await screen.press("Published");
  await screen.press("Save product");
  expect(store.api.saveProduct).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "New coat",
      price: 205,
      stock: 4,
      active: true,
      specifications: { Colour: "Red" },
    }),
  );
  await screen.press("Previous: product details");
  await screen.press("Delete product");
  expect(store.api.deleteProduct).toHaveBeenCalledWith(1, 2);
  await screen.press("Cancel");
  expect(router.replace).toHaveBeenCalledWith("/products");
  await screen.unmount();
  const stale = await render(
    createElement(Form, { initial: { id: 1 }, options }),
  );
  await stale.press("Delete product");
  expect(failures[0]).toEqual(new Error("Reload the product before deleting."));
  await stale.unmount();
});

it("filters and paginates product lists and denies non-admin presentation", async () => {
  const screen = await render(createElement(Products));
  await screen.press("Dashboard");
  await screen.press("Add product");
  await screen.press("Edit Coat");
  await screen.press("Next");
  expect(store.api.adminProducts).toHaveBeenLastCalledWith(2, "");
  await screen.press("Previous");
  await screen.fill("Filter by category", "Coats");
  expect(store.api.adminProducts).toHaveBeenLastCalledWith(1, "Coats");
  store.user = null;
  await screen.rerender(createElement(Products));
  expect(screen.container.textContent).toContain(
    "Sign in with an administrator",
  );
  await screen.unmount();
});

it("uses server order labels and transitions, reloads after advancing, and paginates", async () => {
  const screen = await render(createElement(Orders));
  expect(screen.container.textContent).toContain("Unavailable status");
  await screen.press("Dashboard");
  await screen.press("Mark Processing");
  expect(store.api.advanceOrder).toHaveBeenCalledWith(1, "processing");
  await screen.press("Next");
  await screen.press("Previous");
  await screen.press("Filter: All statuses");
  expect(store.api.adminOrders).toHaveBeenLastCalledWith(1, "placed");
  await screen.press("Filter: Placed");
  await screen.press("Filter: Processing");
  expect(store.api.adminOrders).toHaveBeenLastCalledWith(1, "");
  store.user = null;
  await screen.rerender(createElement(Orders));
  await screen.unmount();
});

it("renders a safe transition label when the server omits its display label", async () => {
  store.api.adminOrders.mockResolvedValueOnce({
    orders: {
      data: [{ id: 1, total: 100, status: "placed" }],
      meta: { last_page: 1 },
    },
    options: {},
    transitions: { placed: "processing" },
  });
  const screen = await render(createElement(Orders));
  expect(screen.container.textContent).toContain("Mark next stage");
  await screen.unmount();
});

it("shows payment status and blocks the fulfillment control for unpaid orders", async () => {
  store.api.adminOrders.mockResolvedValueOnce({
    orders: {
      data: [
        {
          id: 1,
          total: 100,
          status: "placed",
          payment_label: "Awaiting payment",
          can_fulfill: false,
        },
      ],
      meta: { last_page: 1 },
    },
    options: { placed: "Placed", processing: "Processing" },
    transitions: { placed: "processing" },
  });
  const screen = await render(createElement(Orders));
  expect(screen.container.textContent).toContain("Awaiting payment");
  expect(screen.container.textContent).not.toContain("Mark Processing");
  await screen.unmount();
});
