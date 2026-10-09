import type { ShopSlug, StoragePort } from "@portfolio/api-client";
import type { CommerceClient } from "../../../services/store";
import type { PluginClient } from "@portfolio/merchant-plugins";
import type { MiniappClient } from "@portfolio/miniapps";
import React from "react";
import {
  Context,
  useStoreState,
  useStore,
  type StoreTheme,
} from "../logic/context";
import { themes } from "./themes";
import type { DeploymentProfile } from "../../../services/profile";

export { themes, useStore };
export function StoreStateProvider({
  shop,
  children,
  api,
  plugins,
  miniapps,
  storage,
  randomUUID,
  theme,
  profile,
}: {
  shop: ShopSlug;
  children: React.ReactNode;
  api: CommerceClient;
  plugins: PluginClient;
  miniapps: MiniappClient;
  storage: StoragePort;
  randomUUID: () => string;
  theme?: StoreTheme | undefined;
  profile?: DeploymentProfile | null | undefined;
}) {
  const selectedTheme =
    theme ??
    (profile
      ? { ...themes[profile.themeBase], ...profile.branding }
      : shop === "fashion"
        ? themes.fashion
        : shop === "electronics"
          ? themes.electronics
          : null);
  if (!selectedTheme)
    throw new Error("Company Shop requires a validated brand theme");
  const value = useStoreState({
    shop,
    api,
    plugins,
    miniapps,
    storage,
    randomUUID,
    theme: selectedTheme,
    profile,
  });
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
