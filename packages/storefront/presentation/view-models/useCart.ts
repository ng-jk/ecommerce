import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { subtotal as cartSubtotal,changeQuantity } from "../../domain/cart";
import { useStore } from "./context";
export function useCart() {
  const { user, ready, cart, busy, run, setCart, refreshCart } = useStore();
  useFocusEffect(
    useCallback(() => {
      if (user) void run(refreshCart);
    }, [user, run, refreshCart]),
  );
  const subtotal = cartSubtotal(cart);
  const change = (id: number, quantity: number) =>
    run(() => setCart(changeQuantity(cart, id, quantity)));

  return { user, ready, cart, busy, subtotal, change };
}
