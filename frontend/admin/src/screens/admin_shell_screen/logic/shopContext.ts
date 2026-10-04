import { createContext } from "react";
import type { ShopSlug } from "@portfolio/api-client";

export const AdminShopContext = createContext<{
  shop: ShopSlug;
  switchShop(): void;
} | null>(null);
