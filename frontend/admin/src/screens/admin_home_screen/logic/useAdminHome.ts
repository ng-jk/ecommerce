import { useState } from "react";
import { useAdminHomeData } from "../data/useAdminHomeData";
import { useAdminShop } from "../../admin_shell_screen";

export function useAdminHome() {
  const { user, authenticate, logout, run, busy } = useAdminHomeData();
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
