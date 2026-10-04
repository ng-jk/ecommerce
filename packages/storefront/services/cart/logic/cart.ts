import type { CartInput, CartLine } from "@portfolio/api-client";
export function subtotal(lines: CartLine[]): number {
  return lines.reduce(
    (sum, line) => sum + (line.product?.price ?? 0) * line.quantity,
    0,
  );
}
export function changeQuantity(
  lines: CartInput[],
  id: number,
  quantity: number,
): CartInput[] {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99)
    throw new Error("Quantity must be between 0 and 99.");
  return lines.flatMap((line) =>
    line.product_id !== id
      ? [{ product_id: line.product_id, quantity: line.quantity }]
      : quantity
        ? [{ product_id: id, quantity }]
        : [],
  );
}
