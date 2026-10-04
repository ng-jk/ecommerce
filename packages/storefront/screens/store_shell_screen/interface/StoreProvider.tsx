import type { ShopSlug } from "@portfolio/api-client";
import React from "react";
import { useStoreAdapter } from "../logic/useStoreAdapter";
import { StoreStateProvider } from "./context";

export function StoreProvider({
  shop,
  children,
}: {
  shop: ShopSlug;
  children: React.ReactNode;
}) {
  const { api, plugins, storage, randomUUID } = useStoreAdapter(shop);
  return (
    <StoreStateProvider
      shop={shop}
      api={api}
      plugins={plugins}
      storage={storage}
      randomUUID={randomUUID}
    >
      {children}
    </StoreStateProvider>
  );
}
