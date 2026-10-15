export type HelpdeskDirectoryKind =
  "queues" | "agents" | "tickets" | "agent/tickets" | "owner/tickets";

export const helpdeskBase = (organizationId: string) =>
  `/platform/organizations/${organizationId}/helpdesk`;
export const helpdeskPath = (
  organizationId: string,
  kind: HelpdeskDirectoryKind,
  recordId?: number | string,
) =>
  `${helpdeskBase(organizationId)}/${kind}${recordId === undefined ? "" : `/${recordId}`}`;

export const helpdeskTitle: Record<HelpdeskDirectoryKind, string> = {
  queues: "Helpdesk queues",
  agents: "Queue agents",
  tickets: "My tickets",
  "agent/tickets": "Agent desk",
  "owner/tickets": "Owner desk",
};

export const nextTicketStatuses = (
  current: string,
  options: Record<string, string>,
) => {
  const transitions: Record<string, string[]> = {
    open: ["pending", "resolved"],
    pending: ["open", "resolved"],
    resolved: ["closed"],
    closed: [],
  };
  return (transitions[current] ?? []).filter((status) =>
    Object.prototype.hasOwnProperty.call(options, status),
  );
};
