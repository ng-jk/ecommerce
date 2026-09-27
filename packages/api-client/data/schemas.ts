import { z } from "zod";
import { hostedPaymentUrlPattern } from "../domain/payments";
const integer = z.number().int().nonnegative();
export const product = z.object({
  id: integer,
  shop_id: integer,
  name: z.string(),
  category: z.string(),
  description: z.string(),
  image_url: z.string().url(),
  price: integer,
  stock: integer,
  active: z.boolean().default(true),
  specifications: z.record(z.string()).nullable().default(null),
  version: integer.default(0),
});
export const user = z.object({
  id: integer,
  shop_id: integer,
  name: z.string(),
  email: z.string(),
  role: z.string(),
  version: integer.default(0),
  account_status: z.string().default("active"),
});
export const address = z.object({
  name: z.string().min(1).max(100),
  line1: z.string().min(1).max(200),
  city: z.string().min(1).max(100),
  postcode: z.string().min(1).max(20),
  country: z.literal("MY"),
});
export const cartInput = z.object({
  product_id: integer.positive(),
  quantity: integer.min(1).max(99),
});
export const cart = z.object({
  version: integer,
  payment_methods: z.record(z.string()).optional(),
  default_payment_method: z.string().nullable().optional(),
  items: z.array(cartInput.extend({ product: product.nullable() })).max(50),
});
export const order = z.object({
  id: integer,
  shop_id: integer,
  status: z.string(),
  total: integer,
  subtotal: integer,
  shipping: integer,
  currency: z.string(),
  payment_method: z.string(),
  payment_label: z.string().optional(),
  can_fulfill: z.boolean().optional(),
  payment: z
    .object({
      public_id: z.string().uuid(),
      invoice_id: z.string().optional(),
      provider: z.enum(["billplz", "stripe", "custom"]).optional(),
      status: z.enum([
        "queued",
        "creating",
        "pending",
        "review",
        "paid",
        "cancelled",
      ]),
      label: z.string(),
      checkout_url: z.string().regex(hostedPaymentUrlPattern).nullable(),
      paid_at: z.string().nullable(),
    })
    .nullable()
    .optional(),
  created_at: z.string(),
  version: integer.default(0),
  items: z.array(
    z.object({
      product_id: integer,
      name: z.string(),
      price: integer,
      quantity: integer,
    }),
  ),
  shipping_address: address,
});
export const meta = z.object({
  current_page: integer.positive(),
  last_page: integer.positive(),
  total: integer,
  per_page: integer.positive(),
});
export const page = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({ data: z.array(schema), meta });
export const catalog = z.object({
  shop: z.object({ id: integer, slug: z.string(), name: z.string() }),
  categories: z.array(z.string()),
  products: page(product),
});
export const options = z.record(z.string());
export const orders = z.object({
  orders: page(order),
  options,
  transitions: options,
});
export const errorBody = z.object({
  message: z.string().optional(),
  validation_error: z.record(z.array(z.string())).optional(),
});
export const accepted = z.object({
  operation_id: z.string().uuid(),
  status: z.string(),
  poll_url: z.string().startsWith("/api/v1/shops/"),
});
export const operation = z.object({
  operation_id: z.string().uuid(),
  status: z.enum(["queued", "processing", "succeeded", "rejected", "failed"]),
  http_status: integer.nullable(),
  result: z.unknown(),
});
export const productInput = product
  .pick({
    name: true,
    category: true,
    description: true,
    image_url: true,
    price: true,
    stock: true,
    active: true,
    specifications: true,
  })
  .partial();
