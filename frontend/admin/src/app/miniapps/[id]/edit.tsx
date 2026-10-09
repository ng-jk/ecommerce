import { MiniappEditScreen } from "@portfolio/miniapps/screens/miniapp_edit_screen";
import { useStore } from "@portfolio/storefront";
import { router, useLocalSearchParams } from "expo-router";
export default function MiniappEditRoute() {
  const { id, page } = useLocalSearchParams<{ id: string; page: string }>();
  const { miniapps, shop, user } = useStore();
  return user?.role === "admin" ? (
    <MiniappEditScreen
      client={miniapps}
      id={Number(id)}
      page={Number(page) || 1}
      scope={`${shop}.${user.id}`}
      onDone={() => router.replace("/miniapps")}
    />
  ) : null;
}
