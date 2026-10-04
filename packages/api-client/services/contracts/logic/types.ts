export type ShopSlug = "fashion" | "electronics";
export type Product = {
  id: number;
  shop_id: number;
  name: string;
  category: string;
  description: string;
  image_url: string;
  price: number;
  stock: number;
  active: boolean;
  specifications: Record<string, string> | null;
  version: number;
};
export type User = {
  id: number;
  shop_id: number;
  name: string;
  email: string;
  role: string;
  version: number;
  account_status: string;
};
export type Address = {
  name: string;
  line1: string;
  city: string;
  postcode: string;
  country: "MY";
};
export type CartInput = { product_id: number; quantity: number };
export type CartLine = CartInput & { product: Product | null };
export type Order = {
  id: number;
  shop_id: number;
  status: string;
  total: number;
  subtotal: number;
  shipping: number;
  currency: string;
  payment_method: string;
  payment_label?: string | undefined;
  can_fulfill?: boolean | undefined;
  payment?:
    | {
        public_id: string;
        invoice_id?: string | undefined;
        provider?: "billplz" | "stripe" | "custom" | undefined;
        status:
          "queued" | "creating" | "pending" | "review" | "paid" | "cancelled";
        label: string;
        checkout_url: string | null;
        paid_at: string | null;
      }
    | null
    | undefined;
  created_at: string;
  version: number;
  items: {
    product_id: number;
    name: string;
    price: number;
    quantity: number;
  }[];
  shipping_address: Address;
};
export type Page<T> = {
  data: T[];
  meta: {
    current_page: number;
    last_page: number;
    total: number;
    per_page: number;
  };
};
export type StoragePort = {
  clear?(): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};
export type FailureKind =
  | "validation"
  | "unauthenticated"
  | "forbidden"
  | "missing"
  | "conflict"
  | "throttled"
  | "server"
  | "unexpected"
  | "invalid_body"
  | "timeout"
  | "cancelled"
  | "network";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public kind: FailureKind = "unexpected",
    public validation_error: Record<string, string[]> = {},
  ) {
    super(message);
  }
}
export const money = (sen: number): string => "RM " + (sen / 100).toFixed(2);
export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The action could not complete.";
}
