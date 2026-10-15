import { router } from "expo-router";
import { useState } from "react";
import { usePlatformSession } from "../../platform_shell_screen";

export function usePlatformLogin() {
  const session = usePlatformSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [deviceName, setDeviceName] = useState("Commerce Studio");
  const submit = async () => {
    if (await session.login(email, password, deviceName)) {
      setPassword("");
      router.replace("/platform/profile");
    }
  };
  return {
    email,
    setEmail,
    password,
    setPassword,
    deviceName,
    setDeviceName,
    busy: session.busy,
    submit,
  };
}
