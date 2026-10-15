import { useCallback, useState } from "react";
import { usePlatformSession } from "../../platform_shell_screen";
import { usePlatformQuery } from "../../platform_workspace_screen";

const destinations: Record<string, string> = {
  crm: "crm",
  helpdesk: "helpdesk",
  learning: "learning",
  builder: "builder/pages",
  erp: "erp",
  insights: "insights",
  hr: "hr",
  lending: "lending",
};

export function usePlatformServices(id: string) {
  const { api, user } = usePlatformSession();
  const [page, setPage] = useState(1);
  const catalog = usePlatformQuery(
    !!user,
    useCallback(() => api.workspace.catalog(id, page, "", 4), [api, id, page]),
  );
  const result = catalog.result;
  const services =
    result?.data.filter(
      (item) =>
        item.available &&
        item.entitled &&
        item.state === "installed" &&
        destinations[item.application_key],
    ) ?? [];
  return {
    user,
    page,
    setPage,
    catalog,
    result,
    services,
    path: (applicationKey: string) => destinations[applicationKey],
  };
}
