import { Stack } from "expo-router";
import { AdminProvider } from "../screens/admin_shell_screen";

export default function Layout() {
  return (
    <AdminProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </AdminProvider>
  );
}
