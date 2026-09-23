import type {
Address,
CartInput,
CartLine,
Order,
Page,
Product,
User,
} from "@portfolio/api-client/domain/types";
export interface CommerceClient {
  catalog(
    search?: string,
    category?: string,
    page?: number,
  ): Promise<{
    shop: { id: number; slug: string; name: string };
    categories: string[];
    products: Page<Product>;
  }>;
  product(id: string): Promise<{ product: Product }>;
  login(
    email: string,
    password: string,
  ): Promise<{ user: User; token?: string | undefined }>;
  register(
    name: string,
    email: string,
    password: string,
  ): Promise<{ user: User; token?: string | undefined }>;
  me(): Promise<{ user: User }>;
  logout(): Promise<void>;
  cart(): Promise<{ items: CartLine[] }>;
  setCart(items: CartInput[]): Promise<{ items: CartLine[] }>;
  checkout(key: string, address: Address): Promise<{ order: Order }>;
  orders(page?: number): Promise<{
    orders: Page<Order>;
    options: Record<string, string>;
    transitions: Record<string, string>;
  }>;
  adminProducts(
    page?: number,
    category?: string,
  ): Promise<{ products: Page<Product>; options: Record<string, string> }>;
  adminProduct(
    id: string,
  ): Promise<{ product: Product; options: Record<string, string> }>;
  saveProduct(product: Partial<Product>): Promise<{ product: Product }>;
  deleteProduct(id: number, version: number): Promise<{ deleted: boolean }>;
  adminOrders(page?: number, status?: string): Promise<{
    orders: Page<Order>;
    options: Record<string, string>;
    transitions: Record<string, string>;
  }>;
  advanceOrder(id: number, status: string): Promise<{ order: Order }>;
}
