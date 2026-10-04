import { type Address } from "@portfolio/api-client";
import { router } from "expo-router";
import { useState } from "react";
import { subtotal as cartSubtotal } from "../../../services/cart";
import { useStore } from "../../store_shell_screen";
export function useCheckout() {
  const {
    user,
    ready,
    cart,
    checkout,
    busy,
    run,
    refreshCart,
    paymentMethods,
    defaultPaymentMethod,
  } = useStore();
  const [selectedPayment, setPaymentMethod] = useState("");
  const paymentMethod = selectedPayment || defaultPaymentMethod;
  const [address, setAddress] = useState<Address>({
    name: "",
    line1: "",
    city: "",
    postcode: "",
    country: "MY",
  });
  const submit = () =>
    run(async () => {
      if (paymentMethod) await checkout(address, paymentMethod);
      else await checkout(address);
      await refreshCart();
      router.replace("/orders");
    });
  const subtotal = cartSubtotal(cart);
  return {
    user,
    ready,
    cart,
    busy,
    address,
    setAddress,
    submit,
    subtotal,
    paymentMethods,
    paymentMethod,
    setPaymentMethod,
  };
}
