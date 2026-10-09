import { MiniappHostScreen } from "@portfolio/miniapps/screens/miniapp_host_screen";
import { router } from "expo-router";
import { HomeScreen } from "../../home_screen";
import { useStore } from "../../store_shell_screen";
import { miniappHome } from "../logic/home";

export function CompanyHomeScreen() {
  const { profile, miniapps, shop, user } = useStore();
  const home = miniappHome(profile, shop, user?.id ?? null);
  if (!home) return <HomeScreen />;
  return (
    <MiniappHostScreen
      client={miniapps}
      id={home.id}
      scope={home.scope}
      origin={home.origin}
      onBack={() => router.replace("/miniapps")}
    />
  );
}
