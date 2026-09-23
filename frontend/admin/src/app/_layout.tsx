import { Stack } from "expo-router";
import { AdminProvider } from "../composition/AdminProvider";
export default function Layout() {
  return (
    <AdminProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </AdminProvider>
  );
}
