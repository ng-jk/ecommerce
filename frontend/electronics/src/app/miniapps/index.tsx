import { MiniappsScreen } from "@portfolio/miniapps/screens/miniapps_screen";
import { useStore } from "@portfolio/storefront/screens/store_shell_screen";
import { router } from "expo-router";
export default function MiniappsRoute() {
  const { miniapps, shop, user } = useStore();
  return (
    <MiniappsScreen
      client={miniapps}
      scope={`${shop}.${user?.id ?? "guest"}`}
      onOpen={(id) => router.push(`/miniapps/${id}`)}
      onBack={() => router.replace("/")}
    />
  );
}
