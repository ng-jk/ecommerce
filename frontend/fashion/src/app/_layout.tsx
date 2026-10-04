import { StoreProvider } from "@portfolio/storefront/screens/store_shell_screen";
import { Stack } from "expo-router";
export default function Layout() {
  return (
    <StoreProvider shop="fashion">
      <Stack screenOptions={{ headerShown: false }} />
    </StoreProvider>
  );
}
