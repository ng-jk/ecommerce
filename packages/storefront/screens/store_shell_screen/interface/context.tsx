import type { ShopSlug, StoragePort } from "@portfolio/api-client";
import type { CommerceClient } from "../../../services/store";
import React from "react";
import { Context, useStoreState, useStore } from "../logic/context";
import { themes } from "./themes";

export { themes, useStore };
export function StoreStateProvider({
  shop,
  children,
  api,
  storage,
  randomUUID,
}: {
  shop: ShopSlug;
  children: React.ReactNode;
  api: CommerceClient;
  storage: StoragePort;
  randomUUID: () => string;
}) {
  const value = useStoreState({
    shop,
    api,
    storage,
    randomUUID,
    theme: themes[shop],
  });
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
