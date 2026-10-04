import { StoreProvider } from "@portfolio/storefront";
import React from "react";
import { AdminShopContext } from "../logic/shopContext";
import { useAdminSession } from "../logic/useAdminSession";

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const { shop, switchShop } = useAdminSession();
  return (
    <AdminShopContext.Provider value={{ shop, switchShop }}>
      <StoreProvider key={shop} shop={shop}>
        {children}
      </StoreProvider>
    </AdminShopContext.Provider>
  );
}
