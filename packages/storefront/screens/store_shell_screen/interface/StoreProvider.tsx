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
  const { api, storage, randomUUID } = useStoreAdapter(shop);
  return (
    <StoreStateProvider
      shop={shop}
      api={api}
      storage={storage}
      randomUUID={randomUUID}
    >
      {children}
    </StoreStateProvider>
  );
}
