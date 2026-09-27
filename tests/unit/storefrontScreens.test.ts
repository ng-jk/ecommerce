// @vitest-environment jsdom
import { act, cloneElement, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import type {
  CartLine,
  Product,
  User,
} from "../../packages/api-client/domain/types";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const platform = vi.hoisted(() => ({ OS: "web", width: 1000 }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("react-native", async () => ({
  ...(await import("./nativeUnitAdapters")),
  Platform: platform,
  useWindowDimensions: () => ({ width: platform.width }),
}));
vi.mock(
  "react-native-safe-area-context",
  async () => await import("./nativeUnitAdapters"),
);
vi.mock("expo-router", () => ({
  router,
  Link: ({ href, children }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href }, children),
  useLocalSearchParams: () => ({ id: "1" }),
}));
vi.mock("../../packages/storefront/presentation/view-models/context", () => ({
  useStore: () => state,
}));
vi.mock("../../packages/storefront/presentation/view-models/useCart", () => ({
  useCart: () => state,
}));
vi.mock(
  "../../packages/storefront/presentation/view-models/useCheckout",
  () => ({ useCheckout: () => state }),
);
vi.mock("../../packages/storefront/presentation/view-models/useOrders", () => ({
  useOrders: () => state,
}));
vi.mock(
  "../../packages/storefront/presentation/view-models/useProduct",
  () => ({ useProduct: () => state }),
);
vi.mock("../../packages/storefront/presentation/view-models/useHome", () => ({
  useHome: () => state,
}));
import { AccountScreen } from "../../packages/storefront/presentation/screens/AccountScreen";
import { CartScreen } from "../../packages/storefront/presentation/screens/CartScreen";
import { CheckoutScreen } from "../../packages/storefront/presentation/screens/CheckoutScreen";
import { OrdersScreen } from "../../packages/storefront/presentation/screens/OrdersScreen";
import { MenuScreen } from "../../packages/storefront/presentation/screens/MenuScreen";
import { HomeScreen } from "../../packages/storefront/presentation/screens/HomeScreen";
import { ProductScreen } from "../../packages/storefront/presentation/screens/ProductScreen";

const product: Product = {
  id: 1,
  shop_id: 1,
  name: "Coat",
  category: "Coats",
  description: "Warm",
  image_url: "https://example.com/a.png",
  price: 100,
  stock: 100,
  active: true,
  specifications: { Colour: "Blue" },
  version: 0,
};
const user: User = {
  id: 1,
  shop_id: 1,
  name: "Test User",
  email: "test@example.test",
  role: "customer",
  version: 0,
  account_status: "active",
};
const address = {
  name: "Test",
  line1: "Street",
  city: "City",
  postcode: "10000",
  country: "MY" as const,
};
const state = {
  theme: {
    bg: "white",
    ink: "black",
    muted: "gray",
    accent: "green",
    line: "gray",
    surface: "white",
    soft: "gray",
    brand: "Store",
    hero: "gray",
    eyebrow: "New",
    title: "Collection",
    subtitle: "Everyday",
    image: "https://example.com/a.png",
    collection: "Collection",
  },
  shop: "fashion",
  user: user as User | null,
  ready: true,
  busy: false,
  message: "",
  loading: false,
  cart: [] as CartLine[],
  subtotal: 100,
  address,
  paymentMethods: undefined as Record<string, string> | undefined,
  paymentMethod: "",
  setPaymentMethod: vi.fn(),
  setAddress: vi.fn(),
  submit: vi.fn(),
  change: vi.fn(),
  orders: [] as {
    payment_label?: string;
    payment?: { checkout_url: string; invoice_id?: string };
    id: number;
    status: string;
    total: number;
    created_at: string;
    shipping_address: typeof address;
    items: {
      product_id: number;
      name: string;
      quantity: number;
      price: number;
    }[];
  }[],
  options: { placed: "Placed" },
  page: 1,
  last: 1,
  setPage: vi.fn(),
  load: vi.fn(),
  products: [product],
  categories: ["Coats"],
  search: "",
  category: "",
  failed: false,
  setSearch: vi.fn(),
  setCategory: vi.fn(),
  setRetry: vi.fn(),
  lastPage: 1,
  width: 1000,
  wide: true,
  scrollRef: { current: null },
  contentYRef: { current: 0 },
  collectionYRef: { current: 0 },
  product: product as Product | null,
  add: vi.fn(),
  authenticate: vi.fn(),
  logout: vi.fn(),
  run: async (action: () => Promise<void>) => {
    await action();
    return true;
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, {
    user,
    ready: true,
    busy: false,
    message: "",
    loading: false,
    cart: [],
    orders: [],
    product,
    products: [product],
    failed: false,
    lastPage: 1,
    last: 1,
    page: 1,
    shop: "fashion",
    address: { ...address },
    wide: true,
    width: 1000,
  });
  platform.OS = "web";
  platform.width = 1000;
});
async function render(element: ReactElement) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    container,
    async press(label: string) {
      const button = [...container.querySelectorAll("button")].find(
        (item) =>
          item.getAttribute("aria-label") === label ||
          item.textContent === label,
      );
      expect(button, label).toBeDefined();
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
    async refresh() {
      await act(async () => {
        root.render(cloneElement(element, {}));
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
    },
  };
}

it("account loading, login, registration and signed-in actions are reachable", async () => {
  state.ready = false;
  const screen = await render(createElement(AccountScreen));
  expect(screen.container.textContent).toContain("Loading");
  state.ready = true;
  await screen.refresh();
  await screen.press("View my orders");
  await screen.press("Continue shopping");
  await screen.press("Sign out");
  expect(state.logout).toHaveBeenCalledOnce();
  state.user = null;
  await screen.refresh();
  await screen.fill("Email", "test@example.test");
  await screen.fill("Password", "password");
  await screen.press("Sign in");
  expect(state.authenticate).toHaveBeenLastCalledWith(
    "test@example.test",
    "password",
    undefined,
  );
  await screen.press("New here? Create account");
  await screen.fill("Your name", "Name");
  await screen.fill("Password", "password");
  await screen.press("Create account");
  expect(state.authenticate).toHaveBeenLastCalledWith(
    "test@example.test",
    "password",
    "Name",
  );
  state.busy = true;
  await screen.refresh();
  expect(screen.container.textContent).toContain("Please wait");
  state.busy = false;
  await screen.refresh();
  await screen.press("Already a member? Sign in");
  await screen.unmount();
});

it("cart renders loading, guests, empty carts, unavailable lines and quantity limits", async () => {
  state.ready = false;
  const screen = await render(createElement(CartScreen));
  state.ready = true;
  state.user = null;
  await screen.refresh();
  await screen.press("Sign in to continue");
  state.user = user;
  await screen.refresh();
  await screen.press("Explore the collection");
  state.cart = [{ product_id: 1, quantity: 1, product }];
  await screen.refresh();
  await screen.press("+");
  await screen.press("−");
  await screen.press("Remove");
  await screen.press("Continue to checkout");
  expect(state.change.mock.calls).toEqual([
    [1, 2],
    [1, 0],
    [1, 0],
  ]);
  state.cart = [
    { product_id: 1, quantity: 99, product },
    { product_id: 2, quantity: 1, product: null },
  ];
  await screen.refresh();
  expect(screen.container.textContent).toContain("Unavailable product");
  state.busy = true;
  await screen.refresh();
  await screen.unmount();
});

it("checkout validates every required field and supports retrying with an empty cart", async () => {
  state.ready = false;
  const screen = await render(createElement(CheckoutScreen));
  state.ready = true;
  state.user = null;
  await screen.refresh();
  state.user = user;
  await screen.refresh();
  expect(screen.container.textContent).toContain("Your bag is empty");
  await screen.fill("Full name", "Changed");
  const update = state.setAddress.mock.calls[0]?.[0] as (
    value: typeof address,
  ) => typeof address;
  expect(update(address).name).toBe("Changed");
  await screen.press("Place order");
  expect(state.submit).toHaveBeenCalledOnce();
  state.cart = [{ product_id: 1, quantity: 1, product }];
  for (const key of ["name", "line1", "city", "postcode"] as const) {
    state.address = { ...address, [key]: "" };
    await screen.refresh();
    expect(
      screen.container.querySelector<HTMLButtonElement>(
        '[aria-label="Place order"]',
      )?.disabled,
    ).toBe(true);
  }
  state.busy = true;
  await screen.refresh();
  expect(screen.container.textContent).toContain("Placing order");
  await screen.unmount();
});

it("orders render all account/loading/empty states and paginated labeled items", async () => {
  state.ready = false;
  const screen = await render(createElement(OrdersScreen));
  state.ready = true;
  state.user = null;
  await screen.refresh();
  state.user = user;
  state.loading = true;
  await screen.refresh();
  state.loading = false;
  await screen.refresh();
  await screen.press("Refresh orders");
  state.orders = [
    {
      id: 1,
      status: "placed",
      payment_label: "Awaiting payment",
      payment: {
        checkout_url: "https://www.billplz-sandbox.com/bills/bill1",
        invoice_id: "merchant-invoice-1",
      },
      total: 100,
      created_at: "2026-09-22",
      shipping_address: address,
      items: [{ product_id: 1, name: "Coat", quantity: 1, price: 100 }],
    },
    {
      id: 2,
      status: "unknown",
      total: 100,
      created_at: "2026-09-22",
      shipping_address: address,
      items: [],
    },
  ];
  state.last = 3;
  state.page = 2;
  await screen.refresh();
  expect(screen.container.textContent).toContain("Placed");
  expect(screen.container.textContent).toContain("Awaiting payment");
  expect(screen.container.textContent).toContain(
    "Payment reference: merchant-invoice-1",
  );
  expect(screen.container.querySelector("a")?.getAttribute("href")).toBe(
    "https://www.billplz-sandbox.com/bills/bill1",
  );
  await screen.press("Check payment status");
  expect(screen.container.textContent).toContain("Unavailable status");
  await screen.press("Previous");
  await screen.press("Next");
  const calls = state.setPage.mock.calls as [(value: number) => number][];
  expect(calls.map(([update]) => update(2))).toEqual([1, 3]);
  await screen.unmount();
});

it("menu exposes all main destinations", async () => {
  const screen = await render(createElement(MenuScreen));
  for (const label of ["Menu", "Shop", "Bag", "Account", "Orders"])
    await screen.press(label);
  expect(router.push.mock.calls).toEqual([
    ["/menu"],
    ["/"],
    ["/cart"],
    ["/account"],
    ["/orders"],
  ]);
  await screen.press("Assistant");
  expect(router.push).toHaveBeenLastCalledWith("/assistant");
  await screen.unmount();
});
it("renders only server payment methods, blocks unknown values and cycles the selected method", async () => {
  state.paymentMethods = { stripe: "Card", manual: "Merchant invoice" };
  state.paymentMethod = "stripe";
  const screen = await render(createElement(CheckoutScreen));
  await screen.press("Payment: Card");
  expect(state.setPaymentMethod).toHaveBeenLastCalledWith("manual");
  state.paymentMethod = "unsupported";
  await screen.refresh();
  expect(screen.container.textContent).toContain("Choose an available method");
  await screen.press("Payment: Choose an available method");
  expect(state.setPaymentMethod).toHaveBeenLastCalledWith("stripe");
  state.paymentMethods = {};
  await screen.refresh();
  expect(screen.container.textContent).toContain(
    "Payment is currently unavailable",
  );
  expect(
    [...screen.container.querySelectorAll("button")].find(
      (button) => button.textContent === "Place order",
    )?.disabled,
  ).toBe(true);
  state.paymentMethods = undefined;
  await screen.unmount();
});

it("product renders unavailable/loading/stock states and responsive specifications", async () => {
  state.loading = true;
  const screen = await render(createElement(ProductScreen));
  await screen.press("← Back to the collection");
  state.loading = false;
  state.product = null;
  await screen.refresh();
  expect(screen.container.textContent).toContain("Piece not found");
  state.product = product;
  await screen.refresh();
  await screen.press("Add to bag");
  expect(state.add).toHaveBeenCalledOnce();
  state.width = 400;
  state.product = { ...product, stock: 0, specifications: null };
  await screen.refresh();
  expect(screen.container.textContent).toContain("Sold out");
  state.busy = true;
  await screen.refresh();
  await screen.unmount();
});

it("catalog renders responsive themes, filters, failures, pagination and product navigation", async () => {
  const screen = await render(createElement(HomeScreen));
  await screen.press("View Coat");
  await screen.press("Explore the collection ↓");
  await screen.fill("Search products", "coat");
  await screen.press("Coats");
  expect(state.setCategory).toHaveBeenCalledWith("Coats");
  state.lastPage = 3;
  state.page = 2;
  await screen.refresh();
  await screen.press("Previous");
  await screen.press("Next");
  for (const call of state.setPage.mock.calls)
    if (typeof call[0] === "function") expect([1, 3]).toContain(call[0](2));
  state.loading = true;
  await screen.refresh();
  state.loading = false;
  state.failed = true;
  await screen.refresh();
  await screen.press("Try again");
  expect((state.setRetry.mock.calls[0]?.[0] as (n: number) => number)(0)).toBe(
    1,
  );
  state.failed = false;
  state.products = [];
  await screen.refresh();
  await screen.press("Clear filters");
  state.shop = "electronics";
  state.products = [
    product,
    { ...product, id: 2, stock: 0, specifications: null },
  ];
  state.wide = false;
  for (const width of [500, 400]) {
    platform.width = width;
    state.width = width;
    await screen.refresh();
  }
  state.shop = "fashion";
  platform.OS = "ios";
  state.message = "Message";
  await screen.refresh();
  expect(screen.container.textContent).toContain("Message");
  await screen.unmount();
});
