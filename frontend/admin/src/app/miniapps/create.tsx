import { MiniappCreateScreen } from "@portfolio/miniapps/screens/miniapp_create_screen";
import { useStore } from "@portfolio/storefront";
import { router, useLocalSearchParams } from "expo-router";
export default function MiniappCreateRoute() {
  const { packageId, page } = useLocalSearchParams<{
    packageId: string;
    page: string;
  }>();
  const { miniapps, shop, user } = useStore();
  return user?.role === "admin" ? (
    <MiniappCreateScreen
      client={miniapps}
      packageId={Number(packageId)}
      page={Number(page) || 1}
      scope={`${shop}.${user.id}`}
      onDone={() => router.replace("/miniapps")}
    />
  ) : null;
}
