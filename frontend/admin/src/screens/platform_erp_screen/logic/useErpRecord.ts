import { useCallback } from "react";
import { usePlatformSession } from "../../platform_shell_screen";
import { usePlatformQuery } from "../../platform_workspace_screen";

export function useErpAccount(organizationId: string, id: string) {
  const { api, user } = usePlatformSession();
  const load = useCallback(
    () => api.erp.account(organizationId, id),
    [api, organizationId, id],
  );
  return { user, ...usePlatformQuery(!!user, load) };
}

export function useErpJournal(organizationId: string, id: string) {
  const { api, user } = usePlatformSession();
  const load = useCallback(
    () => api.erp.journal(organizationId, id),
    [api, organizationId, id],
  );
  return { user, ...usePlatformQuery(!!user, load) };
}

export function useErpLedger(
  organizationId: string,
  accountId: string,
  page: number,
) {
  const { api, user } = usePlatformSession();
  const load = useCallback(
    () => api.erp.ledger(organizationId, accountId, page, 3),
    [api, organizationId, accountId, page],
  );
  return { user, ...usePlatformQuery(!!user && !!accountId, load) };
}
