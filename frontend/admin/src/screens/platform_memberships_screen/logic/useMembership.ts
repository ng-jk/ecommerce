import { useCallback } from "react";
import { usePlatformSession } from "../../platform_shell_screen";
import { usePlatformQuery } from "../../platform_workspace_screen";

export function useMembership(organizationId: string, membershipId: string) {
  const { api, user } = usePlatformSession();
  const query = usePlatformQuery(
    !!user,
    useCallback(
      () => api.workspace.membership(organizationId, membershipId),
      [api, organizationId, membershipId],
    ),
  );
  return { user, ...query };
}
