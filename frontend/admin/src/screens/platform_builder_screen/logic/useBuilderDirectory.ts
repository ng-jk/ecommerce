import { useCallback, useState } from "react";
import { usePlatformSession } from "../../platform_shell_screen";
import { usePlatformQuery } from "../../platform_workspace_screen";

export function useBuilderDirectory(organizationId: string) {
  const { api, user } = usePlatformSession();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const load = useCallback(
    () => api.builder.pages(organizationId, page, status, 2),
    [api, organizationId, page, status],
  );
  const query = usePlatformQuery(!!user, load);
  const statuses = Object.keys(query.result?.meta.options.status ?? {});
  const cycleStatus = () => {
    setStatus(statuses[statuses.indexOf(status) + 1] ?? "");
    setPage(1);
  };
  return { user, page, setPage, status, cycleStatus, ...query };
}
