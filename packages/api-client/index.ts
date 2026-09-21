import type { components } from "./schema";
export type Product = components["schemas"]["Product"];
export type User = components["schemas"]["User"];
export type Order = components["schemas"]["Order"];
export type Address = components["schemas"]["Address"];
export type CartLine = components["schemas"]["CartLine"];
export type CartInput = components["schemas"]["CartInput"];
export type Page<T> = {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
};
export type ShopSlug = "fashion" | "electronics";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export const money = (sen: number) => "RM " + (sen / 100).toFixed(2);
export function createClient(options: {
  shop: ShopSlug;
  origin: string;
  native: boolean;
  getToken: () => Promise<string | null>;
}) {
  const base = options.origin.replace(/\/$/, "");
  async function request<T>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (options.native) {
      const token = await options.getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    } else if (method !== "GET") {
      // Refresh CSRF before writes; sessions remain host-only for isolated storefronts.
      const csrf = await fetch(`${base}/sanctum/csrf-cookie`, {
        credentials: "include",
      });
      if (!csrf.ok)
        throw new ApiError(
          "Could not establish a secure session.",
          csrf.status,
        );
      const cookie =
        typeof document !== "undefined"
          ? document.cookie.split("; ").find((c) => c.startsWith("XSRF-TOKEN="))
          : undefined;
      if (cookie)
        headers["X-XSRF-TOKEN"] = decodeURIComponent(
          cookie.substring("XSRF-TOKEN=".length),
        );
    }
    let response: Response;
    try {
      response = await fetch(`${base}/api/v1/shops/${options.shop}/${path}`, {
        method,
        headers,
        credentials: options.native ? "omit" : "include",
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new ApiError(
        "Could not reach the shop. Check your connection and try again.",
        0,
      );
    }
    if (response.status === 204) return undefined as T;
    const data = await response
      .json()
      .catch(() => ({
        message: "The server returned an unexpected response.",
      }));
    if (!response.ok) {
      const validation = data.errors
        ? Object.values(data.errors).flat().join("\n")
        : null;
      throw new ApiError(
        validation || data.message || "Something went wrong.",
        response.status,
      );
    }
    return data as T;
  }
  return {
    catalog: (search = "", category = "", page = 1) =>
      request<components["schemas"]["Catalog"]>(
        `products?search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}&page=${page}`,
      ),
    product: (id: string) =>
      request<{ product: Product }>(`products/${encodeURIComponent(id)}`),
    login: (email: string, password: string) =>
      request<components["schemas"]["Auth"]>("auth/login", "POST", {
        email,
        password,
        ...(options.native ? { device_name: "Expo storefront" } : {}),
      }),
    register: (name: string, email: string, password: string) =>
      request<components["schemas"]["Auth"]>("auth/register", "POST", {
        name,
        email,
        password,
        password_confirmation: password,
        ...(options.native ? { device_name: "Expo storefront" } : {}),
      }),
    me: () => request<{ user: User }>("auth/me"),
    logout: () => request<void>("auth/logout", "POST"),
    cart: () => request<{ items: CartLine[] }>("cart"),
    setCart: (items: CartInput[]) =>
      request<{ items: CartLine[] }>("cart", "PUT", { items }),
    checkout: (checkout_key: string, shipping_address: Address) =>
      request<{ order: Order }>("checkout", "POST", {
        checkout_key,
        shipping_address,
      }),
    orders: (page = 1) =>
      request<{ orders: Page<Order> }>(`orders?page=${page}`),
    adminProducts: (page = 1) =>
      request<{ products: Page<Product> }>(`admin/products?page=${page}`),
    saveProduct: (product: Partial<Product>) =>
      request<{ product: Product }>(
        `admin/products${product.id ? "/" + product.id : ""}`,
        product.id ? "PATCH" : "POST",
        product,
      ),
    adminOrders: (page = 1) =>
      request<{ orders: Page<Order> }>(`admin/orders?page=${page}`),
    advanceOrder: (id: number, status: string) =>
      request<{ order: Order }>(`admin/orders/${id}`, "PATCH", { status }),
  };
}
