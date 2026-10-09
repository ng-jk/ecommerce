import { MiniappHostScreen } from "@portfolio/miniapps/screens/miniapp_host_screen";
import { useStore } from "@portfolio/storefront/screens/store_shell_screen";
import { router, useLocalSearchParams } from "expo-router";
export default function MiniappRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { miniapps, shop, user } = useStore();
  return (
    <MiniappHostScreen
      client={miniapps}
      id={id ?? ""}
      scope={`${shop}.${user?.id ?? "guest"}`}
      origin={process.env.EXPO_PUBLIC_MINIAPP_ASSET_ORIGIN ?? ""}
      onBack={() => router.replace("/miniapps")}
    />
  );
}
