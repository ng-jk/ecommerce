import { useState } from "react";
import type { ShopSlug } from "@portfolio/api-client";
import { nextAdminShop } from "../../../services/admin_session";

export function useAdminSession() {
  const [shop, setShop] = useState<ShopSlug>("fashion");
  const switchShop = () => setShop((current) => nextAdminShop(current));
  return { shop, switchShop };
}
