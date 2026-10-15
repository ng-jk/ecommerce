import { useCallback, useState } from "react";
import { usePlatformSession } from "../../platform_shell_screen";
import { usePlatformQuery } from "../../platform_workspace_screen";

export function useErpAccounts(organizationId: string) {
  const { api, user } = usePlatformSession();
  const [page, setPage] = useState(1);
  const [type, setType] = useState("");
  const load = useCallback(
    () => api.erp.accounts(organizationId, page, type, 2),
    [api, organizationId, page, type],
  );
  const query = usePlatformQuery(!!user, load);
  const cycleType = () => {
    const keys = Object.keys(query.result?.meta.options.type ?? {});
    setType(keys[keys.indexOf(type) + 1] ?? "");
    setPage(1);
  };
  return { user, page, setPage, type, cycleType, ...query };
}

export function useErpJournals(organizationId: string) {
  const { api, user } = usePlatformSession();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const load = useCallback(
    () => api.erp.journals(organizationId, page, status, 2),
    [api, organizationId, page, status],
  );
  const query = usePlatformQuery(!!user, load);
  const cycleStatus = () => {
    const keys = Object.keys(query.result?.meta.options.status ?? {});
    setStatus(keys[keys.indexOf(status) + 1] ?? "");
    setPage(1);
  };
  return { user, page, setPage, status, cycleStatus, ...query };
}
