import {
  ApiError,
  type Address,
  type CartLine,
  type ShopSlug,
  type StoragePort,
  type User,
} from "@portfolio/api-client";
import type { PluginClient } from "@portfolio/merchant-plugins";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { checkout as checkoutUseCase } from "../../../services/checkout";
import type { CommerceClient } from "../../../services/store";

export type StoreTheme = {
  brand: string;
  label: string;
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  soft: string;
  hero: string;
  title: string;
  subtitle: string;
  collection: string;
  eyebrow: string;
  image: string;
};
type Store = {
  shop: ShopSlug;
  theme: StoreTheme;
  api: CommerceClient;
  plugins: PluginClient;
  user: User | null;
  cart: CartLine[];
  paymentMethods: Record<string, string>;
  defaultPaymentMethod: string;
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
  refreshSession: () => Promise<void>;
  checkout: (address: Address, paymentMethod?: string) => Promise<void>;
  setCart: (items: { product_id: number; quantity: number }[]) => Promise<void>;
};
export const Context = createContext<Store | null>(null);
export function useStoreState({
  shop,
  api,
  plugins,
  storage,
  randomUUID,
  theme,
}: {
  shop: ShopSlug;
  api: CommerceClient;
  plugins: PluginClient;
  storage: StoragePort;
  randomUUID: () => string;
  theme: StoreTheme;
}) {
  const [user, setUser] = useState<User | null>(null),
    [cart, updateCart] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<Record<string, string>>(
    {},
  );
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState("");
  const refreshCart = useCallback(async () => {
    const data = await api.cart();
    updateCart(data.items);
    setPaymentMethods(data.payment_methods ?? {});
    setDefaultPaymentMethod(data.default_payment_method ?? "");
  }, [api]);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const data = await api.me();
        if (live) {
          setUser(data.user);
          const cartData = await api.cart();
          updateCart(cartData.items);
          setPaymentMethods(cartData.payment_methods ?? {});
          setDefaultPaymentMethod(cartData.default_payment_method ?? "");
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
    if (data.token) await storage.set("token", data.token);
    setUser(data.user);
    await refreshCart();
  };
  const logout = async () => {
    await api.logout();
    await storage.remove("token");
    await storage.clear?.();
    setUser(null);
    updateCart([]);
  };
  const refreshSession = async () => {
    try {
      setUser((await api.me()).user);
      await refreshCart();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) throw error;
      setUser(null);
      updateCart([]);
      await storage.remove("token");
      await storage.clear?.();
    }
  };
  const checkout = async (address: Address, paymentMethod?: string) => {
    if (!user) throw new Error("Sign in to check out.");
    await checkoutUseCase(
      api,
      storage,
      randomUUID,
      user.id,
      address,
      paymentMethod,
    );
  };
  const setCart = async (items: { product_id: number; quantity: number }[]) =>
    updateCart((await api.setCart(items)).items);
  return {
    shop,
    theme,
    api,
    plugins,
    user,
    cart,
    paymentMethods,
    defaultPaymentMethod,
    ready,
    busy,
    message,
    setMessage,
    run,
    authenticate,
    logout,
    refreshCart,
    refreshSession,
    checkout,
    setCart,
  };
}
export function useStore() {
  const value = useContext(Context);
  if (!value) throw new Error("StoreProvider is required");
  return value;
}
