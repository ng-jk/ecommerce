import { router } from "expo-router";
import { useState } from "react";
import { usePlatformSession } from "../../platform_shell_screen";

export function usePlatformRegister() {
  const session = usePlatformSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [deviceName, setDeviceName] = useState("Commerce Studio");
  const submit = async () => {
    if (
      await session.register(name, email, password, confirmation, deviceName)
    ) {
      setPassword("");
      setConfirmation("");
      router.replace("/platform/profile");
    }
  };
  return {
    name,
    setName,
    email,
    setEmail,
    password,
    setPassword,
    confirmation,
    setConfirmation,
    deviceName,
    setDeviceName,
    busy: session.busy,
    submit,
  };
}
