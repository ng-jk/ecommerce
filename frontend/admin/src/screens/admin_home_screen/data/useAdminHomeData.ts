import { useStore } from "@portfolio/storefront";
export function useAdminHomeData() {
  const { user, authenticate, logout, run, busy } = useStore();
  return { user, authenticate, logout, run, busy };
}
