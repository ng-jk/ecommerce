import { useCallback } from "react";
import { usePlatformSession } from "../../platform_shell_screen";
import { usePlatformQuery } from "./usePlatformQuery";

export function usePlatformOrganization(id: string) {
  const { api, user } = usePlatformSession();
  const query = usePlatformQuery(
    !!user,
    useCallback(() => api.workspace.organization(id), [api, id]),
  );
  return { user, ...query };
}
