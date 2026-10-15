import type { z } from "zod";
import {
  helpdeskId,
  helpdeskPage,
  queueList,
  agentList,
  requesterTicketList,
  staffTicketList,
  queueDetail,
  agentDetail,
  requesterTicketDetail,
  staffTicketDetail,
  createQueue,
  updateQueue,
  assignAgent,
  expectedVersion,
  createTicket,
  assignTicket,
  changeTicketStatus,
} from "../logic/contracts";

type Request = <T>(
  path: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  method?: string,
  body?: unknown,
) => Promise<T>;

export function createHelpdeskClient(request: Request) {
  const base = (organizationId: string | number) =>
    `organizations/${helpdeskId.parse(organizationId)}/helpdesk`;
  const record = (
    organizationId: string | number,
    collection: string,
    recordId: string | number,
  ) => `${base(organizationId)}/${collection}/${helpdeskId.parse(recordId)}`;
  const list = (
    organizationId: string | number,
    collection: string,
    page: number,
    filters: Record<string, string | number>,
  ) => {
    const query = new URLSearchParams({
      page: String(helpdeskPage.parse(page)),
    });
    for (const [key, value] of Object.entries(filters)) {
      if (value !== "") query.set(key, String(value));
    }
    return `${base(organizationId)}/${collection}?${query.toString()}`;
  };
  return {
    queues: (organizationId: string | number, page = 1, status = "") =>
      request(list(organizationId, "queues", page, { status }), queueList),
    queue: (organizationId: string | number, id: string | number) =>
      request(record(organizationId, "queues", id), queueDetail),
    createQueue: (
      organizationId: string | number,
      input: z.input<typeof createQueue>,
    ) =>
      request(
        `${base(organizationId)}/queues`,
        queueDetail,
        "POST",
        createQueue.parse(input),
      ),
    updateQueue: (
      organizationId: string | number,
      id: string | number,
      input: z.input<typeof updateQueue>,
    ) =>
      request(
        record(organizationId, "queues", id),
        queueDetail,
        "PATCH",
        updateQueue.parse(input),
      ),
    agents: (
      organizationId: string | number,
      page = 1,
      queueId = "",
      status = "",
    ) =>
      request(
        list(organizationId, "agents", page, {
          queue_id: queueId ? helpdeskId.parse(queueId) : "",
          status,
        }),
        agentList,
      ),
    assignAgent: (
      organizationId: string | number,
      input: z.input<typeof assignAgent>,
    ) =>
      request(
        `${base(organizationId)}/agents`,
        agentDetail,
        "POST",
        assignAgent.parse(input),
      ),
    revokeAgent: (
      organizationId: string | number,
      id: string | number,
      input: z.input<typeof expectedVersion>,
    ) =>
      request(
        `${record(organizationId, "agents", id)}/revoke`,
        agentDetail,
        "POST",
        expectedVersion.parse(input),
      ),
    requesterTickets: (
      organizationId: string | number,
      page = 1,
      queueId = "",
      status = "",
    ) =>
      request(
        list(organizationId, "tickets", page, {
          queue_id: queueId ? helpdeskId.parse(queueId) : "",
          status,
        }),
        requesterTicketList,
      ),
    requesterTicket: (organizationId: string | number, id: string | number) =>
      request(record(organizationId, "tickets", id), requesterTicketDetail),
    createTicket: (
      organizationId: string | number,
      input: z.input<typeof createTicket>,
    ) =>
      request(
        `${base(organizationId)}/tickets`,
        requesterTicketDetail,
        "POST",
        createTicket.parse(input),
      ),
    agentTickets: (
      organizationId: string | number,
      page = 1,
      queueId = "",
      status = "",
    ) =>
      request(
        list(organizationId, "agent/tickets", page, {
          queue_id: queueId ? helpdeskId.parse(queueId) : "",
          status,
        }),
        staffTicketList,
      ),
    agentTicket: (organizationId: string | number, id: string | number) =>
      request(record(organizationId, "agent/tickets", id), staffTicketDetail),
    changeAgentTicketStatus: (
      organizationId: string | number,
      id: string | number,
      input: z.input<typeof changeTicketStatus>,
    ) =>
      request(
        `${record(organizationId, "agent/tickets", id)}/status`,
        staffTicketDetail,
        "POST",
        changeTicketStatus.parse(input),
      ),
    ownerTickets: (
      organizationId: string | number,
      page = 1,
      queueId = "",
      status = "",
    ) =>
      request(
        list(organizationId, "owner/tickets", page, {
          queue_id: queueId ? helpdeskId.parse(queueId) : "",
          status,
        }),
        staffTicketList,
      ),
    ownerTicket: (organizationId: string | number, id: string | number) =>
      request(record(organizationId, "owner/tickets", id), staffTicketDetail),
    assignTicket: (
      organizationId: string | number,
      id: string | number,
      input: z.input<typeof assignTicket>,
    ) =>
      request(
        `${record(organizationId, "owner/tickets", id)}/assign`,
        staffTicketDetail,
        "POST",
        assignTicket.parse(input),
      ),
    changeOwnerTicketStatus: (
      organizationId: string | number,
      id: string | number,
      input: z.input<typeof changeTicketStatus>,
    ) =>
      request(
        `${record(organizationId, "owner/tickets", id)}/status`,
        staffTicketDetail,
        "POST",
        changeTicketStatus.parse(input),
      ),
  };
}
