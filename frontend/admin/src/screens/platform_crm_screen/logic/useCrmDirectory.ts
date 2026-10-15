import { useCallback, useState } from "react";
import { usePlatformSession } from "../../platform_shell_screen";
import { usePlatformQuery } from "../../platform_workspace_screen";
import type { CrmKind, CrmRecord } from "./model";

type DirectoryResult = {
  data: CrmRecord[];
  meta: {
    current_page: number;
    last_page: number;
    total: number;
    per_page: number;
    options?: { status: Record<string, string> };
  };
};

export function useCrmDirectory(organizationId: string, kind: CrmKind) {
  const { api, user } = usePlatformSession();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const load = useCallback(async (): Promise<DirectoryResult> => {
    switch (kind) {
      case "companies":
        return api.crm.companies(organizationId, page);
      case "contacts":
        return api.crm.contacts(organizationId, page);
      case "leads":
        return api.crm.leads(organizationId, page, status);
    }
  }, [api, organizationId, kind, page, status]);
  const query = usePlatformQuery(!!user, load);
  const statuses = Object.keys(query.result?.meta.options?.status ?? {});
  const cycleStatus = () => {
    setStatus(statuses[statuses.indexOf(status) + 1] ?? "");
    setPage(1);
  };
  return { user, page, setPage, status, cycleStatus, ...query };
}
