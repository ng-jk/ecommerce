import { useStore } from "@portfolio/storefront";
export function useAdminPageData() {
  const { theme, message } = useStore();
  return { theme, message };
}
