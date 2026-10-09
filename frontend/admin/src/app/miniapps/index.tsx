import { AdminMiniappsScreen } from "@portfolio/miniapps/screens/admin_miniapps_screen";
import { useStore } from "@portfolio/storefront";
import { router } from "expo-router";
export default function AdminMiniappsRoute() {
  const { miniapps, shop, user } = useStore();
  return user?.role === "admin" ? (
    <AdminMiniappsScreen
      client={miniapps}
      scope={`${shop}.${user.id}`}
      onBack={() => router.replace("/")}
      onCreate={(id, page) =>
        router.push(`/miniapps/create?packageId=${id}&page=${page}`)
      }
      onEdit={(id, page) => router.push(`/miniapps/${id}/edit?page=${page}`)}
    />
  ) : null;
}
