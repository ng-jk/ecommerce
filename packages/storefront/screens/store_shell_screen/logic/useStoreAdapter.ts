import { createClient, type ShopSlug } from "@portfolio/api-client";
import { createPluginClient } from "@portfolio/merchant-plugins";
import * as Crypto from "expo-crypto";
import { useMemo } from "react";
import { Platform } from "react-native";
import { localStorageAdapter } from "../../../services/store";

export function useStoreAdapter(shop: ShopSlug) {
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
        digest: (value) =>
          Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
      }),
    [shop, storage],
  );
  const plugins = useMemo(
    () => createPluginClient({
      shop,
      native: Platform.OS !== "web",
      origin: Platform.OS !== "web" ? (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080") : "",
      getToken: () => storage.get("token"),
      storage,
      randomUUID: Crypto.randomUUID,
      digest: (value) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
    }),
    [shop, storage],
  );
  return { api, plugins, storage, randomUUID: Crypto.randomUUID };
}
