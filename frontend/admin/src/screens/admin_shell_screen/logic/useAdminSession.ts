import { useState } from "react";
import type { BuiltinShopSlug } from "@portfolio/api-client";
import { nextAdminShop } from "../../../services/admin_session";

export function useAdminSession() {
  const [shop, setShop] = useState<BuiltinShopSlug>("fashion");
  const switchShop = () => setShop((current) => nextAdminShop(current));
  return { shop, switchShop };
}
