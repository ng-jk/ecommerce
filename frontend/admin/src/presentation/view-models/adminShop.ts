import type { ShopSlug } from "@portfolio/api-client/domain/types";
import { createContext, useContext } from "react";
export const AdminShopContext = createContext<{
  shop: ShopSlug;
  switchShop(): void;
} | null>(null);
export function useAdminShop() {
  const value = useContext(AdminShopContext);
  if (!value) throw new Error("AdminProvider is required.");
  return value;
}
