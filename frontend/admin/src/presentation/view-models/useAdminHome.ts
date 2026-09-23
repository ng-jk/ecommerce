import { useStore } from "@portfolio/storefront";
import { useState } from "react";
import { useAdminShop } from "./adminShop";
export function useAdminHome() {
  const { user, authenticate, logout, run, busy } = useStore();
  const { shop, switchShop } = useAdminShop();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const signIn = () =>
    run(async () => {
      await authenticate(email, password);
      setPassword("");
    });
  const signOut = () => run(logout);
  const changeShop = () =>
    run(async () => {
      if (user) await logout();
      switchShop();
    });
  return {
    user,
    busy,
    shop,
    email,
    setEmail,
    password,
    setPassword,
    signIn,
    signOut,
    changeShop,
  };
}
