import type { StoragePort } from "@portfolio/api-client";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { z } from "zod";
export function localStorageAdapter(scope: string): StoragePort {
  const prefix = scope + ".";
  const nativeKey = async (value: string) =>
    prefix +
    (value.startsWith("commerce.v1.") ? "cache." : "") +
    (await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      value,
    ));
  const manifest = prefix + "manifest";
  let queue: Promise<void> = Promise.resolve();
  const serialize = (action: () => Promise<void>) => {
    queue = queue.catch(() => undefined).then(action);
    return queue;
  };
  const keys = async () => {
    const raw = await SecureStore.getItemAsync(manifest);
    if (!raw) return [];
    try {
      return z.array(z.string()).parse(JSON.parse(raw));
    } catch {
      return [];
    }
  };
  return {
    get: async (value) =>
      Platform.OS === "web"
        ? typeof window === "undefined"
          ? null
          : window.localStorage.getItem(prefix + value)
        : SecureStore.getItemAsync(await nativeKey(value)),
    set: async (value, content) =>
      serialize(async () => {
        if (Platform.OS === "web") {
          const owned = Object.keys(window.localStorage).filter(
            (key) => key.startsWith(prefix) && key !== prefix + "token",
          );
          if (owned.length >= 100 && !owned.includes(prefix + value)) {
            const evict = owned.find((key) =>
              key.startsWith(prefix + "commerce.v1."),
            );
            if (!evict) throw new Error("Pending action storage is full.");
            window.localStorage.removeItem(evict);
          }
          window.localStorage.setItem(prefix + value, content);
        } else {
          const key = await nativeKey(value);
          const all = await keys();
          if (!all.includes(key)) all.push(key);
          if (all.length > 100) {
            const oldest = all.find((entry) =>
              entry.startsWith(prefix + "cache."),
            );
            if (!oldest) throw new Error("Pending action storage is full.");
            all.splice(all.indexOf(oldest), 1);
            await SecureStore.deleteItemAsync(oldest);
          }
          await SecureStore.setItemAsync(key, content);
          await SecureStore.setItemAsync(manifest, JSON.stringify(all));
        }
      }),
    remove: async (value) => {
      if (Platform.OS === "web") window.localStorage.removeItem(prefix + value);
      else
        await serialize(async () => {
          const key = await nativeKey(value);
          await SecureStore.deleteItemAsync(key);
          await SecureStore.setItemAsync(
            manifest,
            JSON.stringify((await keys()).filter((entry) => entry !== key)),
          );
        });
    },
    clear: async () =>
      serialize(async () => {
        if (Platform.OS === "web") {
          for (const key of Object.keys(window.localStorage))
            if (key.startsWith(prefix)) window.localStorage.removeItem(key);
        } else {
          for (const key of await keys())
            await SecureStore.deleteItemAsync(key);
          await SecureStore.deleteItemAsync(await nativeKey("token"));
          await SecureStore.deleteItemAsync(manifest);
        }
      }),
  };
}
