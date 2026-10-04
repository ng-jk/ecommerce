import { money , hostedPaymentUrlPattern } from "@portfolio/api-client";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}
function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}
function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function amount(value: unknown): string {
  return integer(value) ? money(value) : "Amount unavailable";
}
function reference(value: unknown): string {
  return integer(value) && value > 0 ? ` #${value}` : "";
}
function productRows(value: unknown): string[] {
  const product = record(value);
  if (!product) return ["Product details unavailable."];
  return [
    `${text(product.name, "Product")}${reference(product.id)} — ${amount(product.price)} · ${integer(product.stock) ? `Stock: ${product.stock}` : "Stock unavailable"}`,
  ];
}
function orderRows(
  value: unknown,
  labels: Record<string, unknown> | null,
): string[] {
  const order = record(value);
  if (!order) return ["Order details unavailable."];
  const payment = record(order.payment);
  const rows = [
    `Order${reference(order.id)} — ${amount(order.total)}`,
    text(
      order.payment_label,
      text(payment?.label, "Payment details unavailable"),
    ),
  ];
  const status =
    typeof order.status === "string" ? labels?.[order.status] : undefined;
  if (typeof status === "string") rows.push(`Status: ${status}`);
  if (typeof payment?.invoice_id === "string" && payment.invoice_id !== "")
    rows.push(`Payment reference: ${payment.invoice_id}`);
  return rows;
}
function cartRows(items: unknown[]): string[] {
  if (items.length === 0) return ["Your cart is empty."];
  return items.flatMap((value) => {
    const line = record(value);
    if (!line) return ["Cart item details unavailable."];
    const product = record(line.product);
    return [
      `${text(product?.name, "Product")}${reference(line.product_id)} — ${integer(line.quantity) ? `Quantity: ${line.quantity}` : "Quantity unavailable"} · Each: ${amount(product?.price)}`,
    ];
  });
}
const hiddenFields = new Set([
  "shop_id",
  "version",
  "expected_version",
  "created_at",
  "updated_at",
  "deleted_at",
  "code",
  "meta",
  "options",
  "transitions",
  "checkout_key",
  "operation_id",
]);
function readableRows(value: unknown, prefix = ""): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== "object")
    return [prefix ? `${prefix}: ${String(value)}` : String(value)];
  return Object.entries(value).flatMap(([key, entry]) => {
    if (hiddenFields.has(key) || /password|token|receipt|secret/i.test(key))
      return [];
    const label = key.replaceAll("_", " ");
    const title = label.charAt(0).toUpperCase() + label.slice(1);
    return readableRows(entry, prefix ? `${prefix} · ${title}` : title);
  });
}

export function assistantResultRows(value: unknown): string[] {
  const result = record(value);
  if (!result) return readableRows(value);
  if ("product" in result) return productRows(result.product);
  if ("order" in result) return orderRows(result.order, record(result.options));
  const products = record(result.products);
  if (Array.isArray(products?.data))
    return products.data.length === 0
      ? ["No products found."]
      : products.data.flatMap(productRows);
  const orders = record(result.orders);
  if (Array.isArray(orders?.data))
    return orders.data.length === 0
      ? ["No orders found."]
      : orders.data.flatMap((order) =>
          orderRows(order, record(result.options)),
        );
  if (Array.isArray(result.items)) return cartRows(result.items);
  return readableRows(result);
}

export function assistantPaymentLinks(
  value: unknown,
): { label: string; url: string }[] {
  const result = record(value);
  if (!result) return [];
  const orders =
    "order" in result ? [result.order] : record(result.orders)?.data;
  if (!Array.isArray(orders)) return [];
  return orders.flatMap((value) => {
    const order = record(value);
    const url = record(order?.payment)?.checkout_url;
    const label = `Pay securely${reference(order?.id)}`;
    return typeof url === "string" && hostedPaymentUrlPattern.test(url)
      ? [{ label, url }]
      : [];
  });
}
