import { StoreProvider } from "@portfolio/storefront";
import { Stack } from "expo-router";
export default function Layout() {
  return (
    <StoreProvider shop="fashion">
      <Stack screenOptions={{ headerShown: false }} />
    </StoreProvider>
  );
}
