import { router } from "expo-router";
import {
  PlatformButton,
  PlatformField,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import { usePlatformLogin } from "../logic/usePlatformLogin";

export function PlatformLogin() {
  const model = usePlatformLogin();
  return (
    <PlatformPage title="Platform sign in">
      <PlatformText>
        Use your platform account to access organizations without choosing a
        shop.
      </PlatformText>
      <PlatformField
        label="Email"
        value={model.email}
        onChangeText={model.setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <PlatformField
        label="Password"
        value={model.password}
        onChangeText={model.setPassword}
        secureTextEntry
      />
      <PlatformField
        label="Device name"
        value={model.deviceName}
        onChangeText={model.setDeviceName}
      />
      <PlatformButton
        title="Sign in"
        disabled={model.busy}
        onPress={() => void model.submit()}
      />
      <PlatformButton
        title="Create platform account"
        secondary
        onPress={() => router.replace("/platform/register")}
      />
    </PlatformPage>
  );
}
