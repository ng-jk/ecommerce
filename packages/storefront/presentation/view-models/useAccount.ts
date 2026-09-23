import { router } from "expo-router";
import { useState } from "react";
import { useStore } from "./context";
export function useAccount() {
  const { user, ready, busy, authenticate, logout, run } = useStore();
  const [register, setRegister] = useState(false),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const submit = () =>
    run(async () => {
      await authenticate(email, password, register ? name : undefined);
      setPassword("");
      router.replace("/");
    });
  const signOut = () => run(logout);
  return {
    user,
    ready,
    busy,
    register,
    setRegister,
    name,
    setName,
    email,
    setEmail,
    password,
    setPassword,
    submit,
    signOut,
  };
}
