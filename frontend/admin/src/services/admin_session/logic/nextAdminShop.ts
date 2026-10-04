export function nextAdminShop(
  shop: "fashion" | "electronics",
): "fashion" | "electronics" {
  return shop === "fashion" ? "electronics" : "fashion";
}
