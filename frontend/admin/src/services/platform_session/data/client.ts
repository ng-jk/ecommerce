import { createPlatformClient } from "@portfolio/api-client";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { platformStorage } from "./storage";

export function createPlatformSessionClient() {
  const storage = platformStorage();
  const api = createPlatformClient({
    origin:
      Platform.OS === "web"
        ? ""
        : (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080"),
    native: true,
    getToken: () => storage.get("token"),
    storage,
    randomUUID: Crypto.randomUUID,
    digest: (value) =>
      Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
  });
  return { api, storage };
}
