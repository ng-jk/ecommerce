import { createClient } from "@portfolio/api-client/data/repository";
import type { ShopSlug } from "@portfolio/api-client/domain/types";
import * as Crypto from "expo-crypto";
import React,{ useMemo } from "react";
import { Platform } from "react-native";
import { localStorageAdapter } from "../data/storage";
import { StoreStateProvider } from "../presentation/view-models/context";
export function StoreProvider({
  shop,
  children,
}: {
  shop: ShopSlug;
  children: React.ReactNode;
}) {
  const storage = useMemo(
    () => localStorageAdapter(`portfolio.${shop}`),
    [shop],
  );
  const api = useMemo(
    () =>
      createClient({
        shop,
        native: Platform.OS !== "web",
        origin:
          Platform.OS !== "web"
            ? (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080")
            : "",
        getToken: () => storage.get("token"),
        storage,
        randomUUID: Crypto.randomUUID,
      }),
    [shop, storage],
  );
  return (
    <StoreStateProvider
      shop={shop}
      api={api}
      storage={storage}
      randomUUID={Crypto.randomUUID}
    >
      {children}
    </StoreStateProvider>
  );
}
