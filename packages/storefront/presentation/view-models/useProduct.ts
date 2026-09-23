import { type Product } from "@portfolio/api-client";
import { router } from "expo-router";
import { useEffect,useState } from "react";
import { useWindowDimensions } from "react-native";
import { useStore } from "./context";
export function useProduct(id: string) {
  const { api, theme, user, cart, setCart, run, busy, setMessage } = useStore();
  const [product, setProduct] = useState<Product | null>(null),
    [loading, setLoading] = useState(true);
  const { width } = useWindowDimensions();
  useEffect(() => {
    let live = true;
    api
      .product(id)
      .then((d) => {
        if (live) setProduct(d.product);
      })
      .catch((e) => {
        if (live) {
          setProduct(null);
          setMessage(e.message);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [id, api, setMessage]);
  const add = () =>
    run(async () => {
      if (!user) {
        router.push("/account");
        setMessage(
          "Sign in, then return to your favourite piece to add it to your bag.",
        );
        return;
      }
      if (!product) throw new Error("Product is unavailable.");
      const previous = cart.find((l) => l.product_id === product.id);
      const lines = cart
        .filter((l) => l.product_id !== product.id)
        .map((l) => ({ product_id: l.product_id, quantity: l.quantity }));
      await setCart([
        ...lines,
        { product_id: product.id, quantity: (previous?.quantity || 0) + 1 },
      ]);
      router.push("/cart");
    });
  return { theme, product, loading, width, busy, add };
}
