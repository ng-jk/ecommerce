import { type Address } from "@portfolio/api-client";
import { router } from "expo-router";
import { useState } from "react";
import { subtotal as cartSubtotal } from "../../domain/cart";
import { useStore } from "./context";
export function useCheckout() {
  const { user, ready, cart, checkout, busy, run, refreshCart } = useStore();
  const [address, setAddress] = useState<Address>({
    name: "",
    line1: "",
    city: "",
    postcode: "",
    country: "MY",
  });
  const submit = () =>
    run(async () => {
      await checkout(address);
      await refreshCart();
      router.replace("/orders");
    });
  const subtotal = cartSubtotal(cart);
  return { user, ready, cart, busy, address, setAddress, submit, subtotal };
}
