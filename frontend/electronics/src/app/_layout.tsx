import { ProfiledStoreProvider } from "@portfolio/storefront/screens/store_shell_screen";
import { Stack } from "expo-router";
export default function Layout() {
  return (
    <ProfiledStoreProvider
      defaultShop="electronics"
      required={process.env.EXPO_PUBLIC_COMPANY_PROFILE_REQUIRED === "true"}
    >
      <Stack screenOptions={{ headerShown: false }} />
    </ProfiledStoreProvider>
  );
}
