import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createClient } from "../../packages/api-client/data/repository";
import { memoryStorage } from "../../packages/api-client/data/cache";

const product = {
  id: 1,
  shop_id: 1,
  name: "Coat",
  category: "Layers",
  description: "Cotton",
  image_url: "https://example.com/a.png",
  price: 101,
  stock: 10,
  active: true,
  specifications: null,
  version: 3,
};
const address = {
  name: "A",
  line1: "B",
  city: "C",
  postcode: "123",
  country: "MY" as const,
};
const order = {
  id: 2,
  shop_id: 1,
  status: "placed",
  subtotal: 101,
  shipping: 800,
  total: 901,
  currency: "MYR",
  payment_method: "demo",
  created_at: "2026-09-22",
  version: 4,
  items: [],
  shipping_address: address,
};
const user = {
  id: 1,
  shop_id: 1,
  name: "Customer",
  email: "customer@example.test",
  role: "customer",
  version: 0,
  account_status: "active",
};
const meta = { current_page: 1, last_page: 1, total: 1, per_page: 24 };
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
const fetcher = vi.fn<typeof fetch>();
const client = () =>
  createClient({
    shop: "fashion",
    origin: "https://example.test",
    native: true,
    getToken: async () => null,
    storage: memoryStorage(),
    randomUUID: () => "00000000-0000-4000-8000-000000000001",
  });
beforeEach(() => {
  fetcher.mockReset();
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());

it("supports browser authentication and default identity/storage adapters", async () => {
  const api = createClient({
    shop: "fashion",
    origin: "",
    native: false,
    getToken: async () => null,
  });
  fetcher
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(json({ user }));
  await api.login("test@example.test", "password");
  expect(
    JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)),
  ).not.toHaveProperty("device_name");
  fetcher
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(json({ user }));
  await api.register("Name", "test@example.test", "password1234");
  fetcher
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(json({ order }));
  await api.advanceOrder(2, "processing");
  expect(
    JSON.parse(String(fetcher.mock.lastCall?.[1]?.body)).expected_version,
  ).toBe(0);
});

it("validates and caches only public catalog reads", async () => {
  fetcher.mockImplementation(async () =>
    json({
      shop: { id: 1, slug: "fashion", name: "Fashion" },
      categories: ["Layers"],
      products: { data: [product], meta },
    }),
  );
  const api = client();
  const first = await api.catalog("Coat", "Layers");
  expect(first.products.data[0]?.price).toBe(101);
  await api.catalog("Coat", "Layers");
  expect(fetcher).toHaveBeenCalledTimes(1);
  await api.catalog("Other", "Layers");
  expect(fetcher).toHaveBeenCalledTimes(2);
  await expect(api.catalog("x".repeat(101))).rejects.toThrow();
  await expect(api.catalog("", "", 0)).rejects.toThrow();
});
it("carries authoritative cart versions into mutations and checkout", async () => {
  const api = client();
  fetcher.mockResolvedValueOnce(json({ items: [], version: 7 }));
  await api.cart();
  fetcher.mockResolvedValueOnce(
    json({ items: [{ product_id: 1, quantity: 2, product }], version: 8 }),
  );
  await api.setCart([{ product_id: 1, quantity: 2 }]);
  expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
    items: [{ product_id: 1, quantity: 2 }],
    expected_version: 7,
  });
  fetcher.mockResolvedValueOnce(json({ order }));
  await api.checkout("00000000-0000-4000-8000-000000000001", address);
  expect(
    JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body)).expected_version,
  ).toBe(8);
  await expect(
    api.setCart([{ product_id: 1, quantity: 100 }]),
  ).rejects.toThrow();
});
it("uses server versions for order transitions and caller versions for product changes", async () => {
  const api = client();
  fetcher.mockResolvedValueOnce(
    json({
      orders: { data: [order], meta },
      options: { placed: "Placed" },
      transitions: { placed: "processing" },
    }),
  );
  await api.adminOrders(1, "placed");
  fetcher.mockResolvedValueOnce(
    json({ order: { ...order, status: "processing" } }),
  );
  await api.advanceOrder(2, "processing");
  expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
    status: "processing",
    expected_version: 4,
  });
  fetcher.mockResolvedValueOnce(json({ product }));
  await api.saveProduct(product);
  expect(
    JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body)).expected_version,
  ).toBe(3);
  expect(fetcher.mock.calls[2]?.[1]?.method).toBe("PATCH");
  fetcher.mockResolvedValueOnce(json({ deleted: true }));
  await api.deleteProduct(1, 3);
  expect(JSON.parse(String(fetcher.mock.calls[3]?.[1]?.body))).toEqual({
    expected_version: 3,
  });
  expect(() => api.deleteProduct(1, -1)).toThrow();
});
it("validates detail, metadata, authentication and logout contracts", async () => {
  const api = client();
  fetcher.mockResolvedValueOnce(json({ product }));
  expect((await api.product("1")).product.name).toBe("Coat");
  expect(() => api.product("NaN")).toThrow();
  fetcher.mockResolvedValueOnce(
    json({
      products: { data: [product], meta },
      options: { "1": "Published" },
    }),
  );
  await api.adminProducts(1, "Layers");
  expect(String(fetcher.mock.calls[1]?.[0])).toContain("category=Layers");
  fetcher.mockResolvedValueOnce(
    json({ product, options: { "1": "Published" } }),
  );
  await api.adminProduct("1");
  fetcher.mockResolvedValueOnce(json({ product }));
  await api.saveProduct({ name: "New" });
  expect(fetcher.mock.calls[3]?.[1]?.method).toBe("POST");
  fetcher.mockResolvedValueOnce(json({ user, token: "secret" }));
  await api.login(user.email, "password");
  expect(JSON.parse(String(fetcher.mock.calls[4]?.[1]?.body)).device_name).toBe(
    "Expo storefront",
  );
  fetcher.mockResolvedValueOnce(json({ user }));
  await api.register("Customer", user.email, "Password123!");
  fetcher.mockResolvedValueOnce(json({ user }));
  expect((await api.me()).user.id).toBe(1);
  fetcher.mockResolvedValueOnce(
    json({
      orders: { data: [order], meta },
      options: { placed: "Placed" },
      transitions: { placed: "processing" },
    }),
  );
  await api.orders();
  fetcher.mockResolvedValueOnce(json({ logged_out: true }));
  await expect(api.logout()).resolves.toBeUndefined();
  expect(() => api.login("invalid", "password")).toThrow();
  expect(() => api.register("Customer", user.email, "short")).toThrow();
});
