import { Stack } from "expo-router";
import { PlatformProvider } from "../../screens/platform_shell_screen";

export default function PlatformLayout() {
  return (
    <PlatformProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </PlatformProvider>
  );
}
