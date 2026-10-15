import type { StoragePort } from "@portfolio/api-client";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { parseManifest } from "../logic/manifest";

const webValues = new Map<string, string>();
const manifestKey = "portfolio.platform.manifest";
const prefix = "portfolio.platform.";

async function nativeKey(key: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    key,
  );
  return prefix + digest;
}

async function manifest(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(manifestKey);
  return parseManifest(raw);
}

export function platformStorage(): StoragePort {
  let queue: Promise<void> = Promise.resolve();
  const serialize = (action: () => Promise<void>): Promise<void> => {
    queue = queue.catch(() => undefined).then(action);
    return queue;
  };
  return {
    get: async (key) =>
      Platform.OS === "web"
        ? (webValues.get(key) ?? null)
        : SecureStore.getItemAsync(await nativeKey(key)),
    set: async (key, value) =>
      serialize(async () => {
        if (Platform.OS === "web") {
          if (webValues.size >= 100 && !webValues.has(key))
            throw new Error("Platform session storage is full.");
          webValues.set(key, value);
          return;
        }
        const encoded = await nativeKey(key);
        const keys = await manifest();
        if (!keys.includes(encoded)) {
          if (keys.length >= 100)
            throw new Error("Platform session storage is full.");
          keys.push(encoded);
        }
        await SecureStore.setItemAsync(encoded, value);
        await SecureStore.setItemAsync(manifestKey, JSON.stringify(keys));
      }),
    remove: async (key) =>
      serialize(async () => {
        if (Platform.OS === "web") {
          webValues.delete(key);
          return;
        }
        const encoded = await nativeKey(key);
        await SecureStore.deleteItemAsync(encoded);
        await SecureStore.setItemAsync(
          manifestKey,
          JSON.stringify((await manifest()).filter((item) => item !== encoded)),
        );
      }),
    clear: async () =>
      serialize(async () => {
        if (Platform.OS === "web") {
          webValues.clear();
          return;
        }
        for (const key of await manifest())
          await SecureStore.deleteItemAsync(key);
        await SecureStore.deleteItemAsync(manifestKey);
      }),
  };
}
