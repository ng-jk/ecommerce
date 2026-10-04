import { useContext } from "react";
import { AdminShopContext } from "./shopContext";

export function useAdminShop() {
  const value = useContext(AdminShopContext);
  if (!value) throw new Error("AdminProvider is required.");
  return value;
}
