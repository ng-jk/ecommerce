import { useCallback } from "react";
import { usePlatformSession } from "../../platform_shell_screen";
import { usePlatformQuery } from "../../platform_workspace_screen";

export function useBuilderRecord(organizationId: string, pageId: string) {
  const { api, user } = usePlatformSession();
  const load = useCallback(
    () => api.builder.page(organizationId, pageId),
    [api, organizationId, pageId],
  );
  return { user, ...usePlatformQuery(!!user, load) };
}
