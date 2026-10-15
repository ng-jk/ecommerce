import { useCallback, useState } from "react";
import { usePlatformSession } from "../../platform_shell_screen";
import { usePlatformQuery } from "./usePlatformQuery";

export function usePlatformOrganizations() {
  const { api, user } = usePlatformSession();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const query = usePlatformQuery(
    !!user,
    useCallback(
      () => api.workspace.organizations(page, status),
      [api, page, status],
    ),
  );
  const statuses = query.result
    ? Object.keys(query.result.meta.options.status)
    : [];
  const cycleStatus = () => {
    const index = statuses.indexOf(status);
    setStatus(statuses[index + 1] ?? "");
    setPage(1);
  };
  return { user, page, setPage, status, cycleStatus, ...query };
}
