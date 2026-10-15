import { useCallback, useState } from "react";
import { usePlatformSession } from "../../platform_shell_screen";
import { usePlatformQuery } from "../../platform_workspace_screen";
import type { HelpdeskDirectoryKind } from "./model";
import type {
  HelpdeskAgent,
  HelpdeskQueue,
  HelpdeskRequesterTicketSummary,
  HelpdeskStaffTicketSummary,
} from "@portfolio/api-client";

type DirectoryResult = {
  data: (
    | HelpdeskAgent
    | HelpdeskQueue
    | HelpdeskRequesterTicketSummary
    | HelpdeskStaffTicketSummary
  )[];
  meta: {
    current_page: number;
    last_page: number;
    total: number;
    per_page: number;
    options: { status: Record<string, string> };
  };
};

export function useHelpdeskDirectory(
  organizationId: string,
  kind: HelpdeskDirectoryKind,
) {
  const { api, user } = usePlatformSession();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const load = useCallback(async (): Promise<DirectoryResult> => {
    switch (kind) {
      case "queues":
        return api.helpdesk.queues(organizationId, page, status);
      case "agents":
        return api.helpdesk.agents(organizationId, page, "", status);
      case "tickets":
        return api.helpdesk.requesterTickets(organizationId, page, "", status);
      case "agent/tickets":
        return api.helpdesk.agentTickets(organizationId, page, "", status);
      case "owner/tickets":
        return api.helpdesk.ownerTickets(organizationId, page, "", status);
    }
  }, [api, organizationId, kind, page, status]);
  const query = usePlatformQuery(!!user, load);
  const statuses = Object.keys(query.result?.meta.options.status ?? {});
  const cycleStatus = () => {
    setStatus(statuses[statuses.indexOf(status) + 1] ?? "");
    setPage(1);
  };
  return { user, page, setPage, status, cycleStatus, ...query };
}
