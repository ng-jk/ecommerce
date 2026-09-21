import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import {
  ApiError,
  createClient,
  type CartLine,
  type ShopSlug,
  type User,
} from "@portfolio/api-client";

export const themes = {
  fashion: {
    brand: "maison.",
    label: "EVERYDAY, CONSIDERED.",
    bg: "#f8f6f1",
    surface: "#ffffff",
    ink: "#252c25",
    muted: "#697066",
    line: "#e0e3d9",
    accent: "#365642",
    soft: "#e7eade",
    hero: "#e4e8dc",
    title: "Less, but\nbetter.",
    subtitle:
      "Thoughtful pieces. Effortless days.\nMake room for the things that feel like you.",
    collection: "The everyday edit",
    eyebrow: "THE NEW SEASON / VOL. 01",
    image:
      "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1200&auto=format&fit=crop&q=85",
  },
  electronics: {
    brand: "VOLT",
    label: "A LITTLE AHEAD.",
    bg: "#101619",
    surface: "#1a2328",
    ink: "#f1f5ee",
    muted: "#a6b4b8",
    line: "#344248",
    accent: "#cbf36b",
    soft: "#293829",
    hero: "#1d2c2e",
    title: "Upgrade your\neveryday.",
    subtitle:
      "Good technology gets out of your way.\nMeet the gear that moves you forward.",
    collection: "Find your next upgrade",
    eyebrow: "CURATED TECH / BIG POSSIBILITIES",
    image:
      "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=1200&auto=format&fit=crop&q=85",
  },
};
type Store = {
  shop: ShopSlug;
  theme: typeof themes.fashion;
  api: ReturnType<typeof createClient>;
  user: User | null;
  cart: CartLine[];
  ready: boolean;
  busy: boolean;
  message: string;
  setMessage: (s: string) => void;
  run: (action: () => Promise<void>) => Promise<boolean>;
  authenticate: (
    email: string,
    password: string,
    name?: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshCart: () => Promise<void>;
  setCart: (items: { product_id: number; quantity: number }[]) => Promise<void>;
};
const Context = createContext<Store | null>(null);
export function StoreProvider({
  shop,
  children,
}: {
  shop: ShopSlug;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null),
    [cart, updateCart] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const native = Platform.OS !== "web";
  const key = `portfolio.${shop}.token`;
  const api = useMemo(
    () =>
      createClient({
        shop,
        native,
        origin: native
          ? process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080"
          : "",
        getToken: () =>
          native ? SecureStore.getItemAsync(key) : Promise.resolve(null),
      }),
    [shop, native, key],
  );
  const refreshCart = useCallback(
    async () => updateCart((await api.cart()).items),
    [api],
  );
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const data = await api.me();
        if (live) {
          setUser(data.user);
          updateCart((await api.cart()).items);
        }
      } catch (e) {
        if (live && !(e instanceof ApiError && e.status === 401))
          setMessage((e as Error).message);
      } finally {
        if (live) setReady(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [api]);
  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
      return true;
    } catch (e) {
      setMessage((e as Error).message);
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
        updateCart([]);
      }
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  const authenticate = async (
    email: string,
    password: string,
    name?: string,
  ) => {
    const data =
      name !== undefined
        ? await api.register(name, email, password)
        : await api.login(email, password);
    if (native && data.token) await SecureStore.setItemAsync(key, data.token);
    setUser(data.user);
    await refreshCart();
  };
  const logout = async () => {
    await api.logout();
    if (native) await SecureStore.deleteItemAsync(key);
    setUser(null);
    updateCart([]);
  };
  const setCart = async (items: { product_id: number; quantity: number }[]) =>
    updateCart((await api.setCart(items)).items);
  return (
    <Context.Provider
      value={{
        shop,
        theme: themes[shop],
        api,
        user,
        cart,
        ready,
        busy,
        message,
        setMessage,
        run,
        authenticate,
        logout,
        refreshCart,
        setCart,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useStore() {
  const value = useContext(Context);
  if (!value) throw new Error("StoreProvider is required");
  return value;
}
