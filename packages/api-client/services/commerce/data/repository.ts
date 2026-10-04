import { z } from "zod";
import type {
  Address,
  CartInput,
  Product,
  ShopSlug,
  StoragePort,
} from "../../contracts";
import { Cache, memoryStorage } from "../../cache";
import { schemas } from "../../contracts";
import { createTransport } from "../../transport";
import { assistantAdapter } from "../../assistant";
export function createClient(options: {
  shop: ShopSlug;
  origin: string;
  native: boolean;
  getToken(): Promise<string | null>;
  randomUUID?: () => string;
  storage?: StoragePort;
  digest?: (value: string) => Promise<string>;
}) {
  const storage = options.storage ?? memoryStorage();
  const cache = new Cache(storage, `${options.shop}.public`);
  const request = createTransport({
    ...options,
    storage,
    randomUUID: options.randomUUID ?? (() => crypto.randomUUID()),
  });
  let cartVersion = 0;
  const orderVersions = new Map<number, number>();
  const pageNumber = (page: number) => z.number().int().min(1).parse(page);
  const idValue = (id: string | number) =>
    z.coerce.number().int().positive().parse(id);
  return {
    assistant: assistantAdapter(
      request,
      options.native ? storage : memoryStorage(),
      options.randomUUID ?? (() => crypto.randomUUID()),
      options.native,
    ),
    catalog: async (search = "", category = "", page = 1) => {
      const path = `products?search=${encodeURIComponent(z.string().max(100).parse(search))}&category=${encodeURIComponent(z.string().max(80).parse(category))}&page=${pageNumber(page)}`;
      const cached = await cache.read(path, schemas.catalog);
      if (cached) return cached;
      const result = await request(path, schemas.catalog);
      await cache.write(path, result);
      return result;
    },
    product: (id: string) =>
      request(
        `products/${idValue(id)}`,
        z.object({ product: schemas.product }),
      ),
    login: (email: string, password: string) =>
      request(
        "auth/login",
        z.object({ user: schemas.user, token: z.string().optional() }),
        "POST",
        {
          email: z.string().email().parse(email),
          password: z.string().min(1).parse(password),
          ...(options.native ? { device_name: "Expo storefront" } : {}),
        },
      ),
    register: (name: string, email: string, password: string) =>
      request(
        "auth/register",
        z.object({ user: schemas.user, token: z.string().optional() }),
        "POST",
        {
          name: z.string().min(1).max(100).parse(name),
          email: z.string().email().parse(email),
          password: z.string().min(10).parse(password),
          password_confirmation: password,
          ...(options.native ? { device_name: "Expo storefront" } : {}),
        },
      ),
    me: () => request("auth/me", z.object({ user: schemas.user })),
    logout: () =>
      request(
        "auth/logout",
        z.object({ logged_out: z.boolean() }),
        "POST",
      ).then(() => undefined),
    cart: async () => {
      const result = await request("cart", schemas.cart);
      cartVersion = result.version;
      return result;
    },
    setCart: async (items: CartInput[]) => {
      const result = await request("cart", schemas.cart, "PUT", {
        items: z.array(schemas.cartInput).max(50).parse(items),
        expected_version: cartVersion,
      });
      cartVersion = result.version;
      return result;
    },
    checkout: (
      checkout_key: string,
      shipping_address: Address,
      payment_method?: string,
    ) =>
      request("checkout", z.object({ order: schemas.order }), "POST", {
        checkout_key: z.string().uuid().parse(checkout_key),
        expected_version: cartVersion,
        shipping_address: schemas.address.parse(shipping_address),
        ...(payment_method === undefined
          ? {}
          : {
              payment_method: z.string().min(1).max(80).parse(payment_method),
            }),
      }),
    orders: (page = 1) =>
      request(`orders?page=${pageNumber(page)}`, schemas.orders),
    adminProducts: (page = 1, category = "") =>
      request(
        `admin/products?page=${pageNumber(page)}&category=${encodeURIComponent(z.string().max(80).parse(category))}`,
        z.object({
          products: schemas.page(schemas.product),
          options: schemas.options,
        }),
      ),
    adminProduct: (id: string) =>
      request(
        `admin/products/${idValue(id)}`,
        z.object({ product: schemas.product, options: schemas.options }),
      ),
    saveProduct: (product: Partial<Product>) =>
      request(
        `admin/products${product.id ? "/" + idValue(product.id) : ""}`,
        z.object({ product: schemas.product }),
        product.id ? "PATCH" : "POST",
        {
          ...schemas.productInput.parse(product),
          expected_version: product.version ?? 0,
        },
      ),
    deleteProduct: (id: number, version: number) =>
      request(
        `admin/products/${idValue(id)}`,
        z.object({ deleted: z.boolean() }),
        "DELETE",
        { expected_version: z.number().int().nonnegative().parse(version) },
      ),
    adminOrders: async (page = 1, status = "") => {
      const result = await request(
        `admin/orders?page=${pageNumber(page)}&status=${encodeURIComponent(z.string().max(30).parse(status))}`,
        schemas.orders,
      );
      for (const order of result.orders.data)
        orderVersions.set(order.id, order.version);
      return result;
    },
    advanceOrder: (id: number, status: string) =>
      request(
        `admin/orders/${idValue(id)}`,
        z.object({ order: schemas.order }),
        "PATCH",
        {
          status: z.string().min(1).parse(status),
          expected_version: orderVersions.get(id) ?? 0,
        },
      ),
  };
}
