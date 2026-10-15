import { router } from "expo-router";
import {
  PlatformButton,
  PlatformField,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import { usePlatformRegister } from "../logic/usePlatformRegister";

export function PlatformRegister() {
  const model = usePlatformRegister();
  return (
    <PlatformPage title="Create platform account">
      <PlatformText>
        This account is separate from shop accounts. Existing shops stay with
        their current owners.
      </PlatformText>
      <PlatformField
        label="Name"
        value={model.name}
        onChangeText={model.setName}
      />
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
        label="Confirm password"
        value={model.confirmation}
        onChangeText={model.setConfirmation}
        secureTextEntry
      />
      <PlatformField
        label="Device name"
        value={model.deviceName}
        onChangeText={model.setDeviceName}
      />
      <PlatformButton
        title="Create account"
        disabled={model.busy}
        onPress={() => void model.submit()}
      />
      <PlatformButton
        title="Sign in instead"
        secondary
        onPress={() => router.replace("/platform/login")}
      />
    </PlatformPage>
  );
}
