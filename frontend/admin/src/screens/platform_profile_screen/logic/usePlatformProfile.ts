import { router } from "expo-router";
import { usePlatformSession } from "../../platform_shell_screen";

export function usePlatformProfile() {
  const session = usePlatformSession();
  const signOut = async () => {
    if (await session.logout()) router.replace("/platform/login");
  };
  return { ...session, signOut };
}
