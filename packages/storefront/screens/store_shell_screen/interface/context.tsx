import type { ShopSlug, StoragePort } from "@portfolio/api-client";
import type { CommerceClient } from "../../../services/store";
import type { PluginClient } from "@portfolio/merchant-plugins";
import React from "react";
import { Context, useStoreState, useStore } from "../logic/context";
import { themes } from "./themes";

export { themes, useStore };
export function StoreStateProvider({
  shop,
  children,
  api,
  plugins,
  storage,
  randomUUID,
}: {
  shop: ShopSlug;
  children: React.ReactNode;
  api: CommerceClient;
  plugins: PluginClient;
  storage: StoragePort;
  randomUUID: () => string;
}) {
  const value = useStoreState({
    shop,
    api,
    plugins,
    storage,
    randomUUID,
    theme: themes[shop],
  });
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
