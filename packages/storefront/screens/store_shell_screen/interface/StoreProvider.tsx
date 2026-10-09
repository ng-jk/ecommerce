import type { ShopSlug } from "@portfolio/api-client";
import type { StoreTheme } from "../logic/context";
import type { DeploymentProfile } from "../../../services/profile";
import React from "react";
import { useStoreAdapter } from "../logic/useStoreAdapter";
import { StoreStateProvider } from "./context";

export function StoreProvider({
  shop,
  children,
  theme,
  profile,
}: {
  shop: ShopSlug;
  children: React.ReactNode;
  theme?: StoreTheme;
  profile?: DeploymentProfile | null;
}) {
  const { api, plugins, miniapps, storage, randomUUID } = useStoreAdapter(shop);
  return (
    <StoreStateProvider
      shop={shop}
      api={api}
      plugins={plugins}
      miniapps={miniapps}
      storage={storage}
      randomUUID={randomUUID}
      theme={theme}
      profile={profile}
    >
      {children}
    </StoreStateProvider>
  );
}
