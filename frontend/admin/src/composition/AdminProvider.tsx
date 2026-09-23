import type { ShopSlug } from "@portfolio/api-client/domain/types";
import { StoreProvider } from "@portfolio/storefront";
import React, { useState } from "react";
import { AdminShopContext as Context } from "../presentation/view-models/adminShop";
export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [shop, setShop] = useState<ShopSlug>("fashion");
  return (
    <Context.Provider
      value={{
        shop,
        switchShop: () =>
          setShop((value) => (value === "fashion" ? "electronics" : "fashion")),
      }}
    >
      <StoreProvider key={shop} shop={shop}>
        {children}
      </StoreProvider>
    </Context.Provider>
  );
}
