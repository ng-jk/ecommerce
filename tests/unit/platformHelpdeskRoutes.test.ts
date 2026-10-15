// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.mock("../../frontend/admin/src/screens/platform_helpdesk_screen", () => ({
  HelpdeskHub: () => createElement("span", {}, "hub"),
  HelpdeskDirectory: ({ kind }: { kind: string }) => createElement("span", {}, `directory:${kind}`),
  HelpdeskQueueRecord: () => createElement("span", {}, "queue:detail"),
  HelpdeskTicketRecord: ({ mode }: { mode: string }) => createElement("span", {}, `ticket:${mode}`),
  HelpdeskQueueForm: ({ edit }: { edit?: boolean }) => createElement("span", {}, edit ? "queue:edit" : "queue:create"),
  HelpdeskTicketForm: () => createElement("span", {}, "ticket:create"),
  HelpdeskAgentAssign: () => createElement("span", {}, "agent:assign"),
  HelpdeskTicketAssign: () => createElement("span", {}, "ticket:assign"),
}));

import Hub from "../../frontend/admin/src/app/platform/organizations/[id]/helpdesk";
import Queues from "../../frontend/admin/src/app/platform/organizations/[id]/helpdesk/queues";
import QueueCreate from "../../frontend/admin/src/app/platform/organizations/[id]/helpdesk/queues/create";
import QueueDetail from "../../frontend/admin/src/app/platform/organizations/[id]/helpdesk/queues/[recordId]";
import QueueEdit from "../../frontend/admin/src/app/platform/organizations/[id]/helpdesk/queues/[recordId]/edit";
import Agents from "../../frontend/admin/src/app/platform/organizations/[id]/helpdesk/agents";
import AgentAssign from "../../frontend/admin/src/app/platform/organizations/[id]/helpdesk/agents/assign";
import Tickets from "../../frontend/admin/src/app/platform/organizations/[id]/helpdesk/tickets";
import TicketCreate from "../../frontend/admin/src/app/platform/organizations/[id]/helpdesk/tickets/create";
import TicketDetail from "../../frontend/admin/src/app/platform/organizations/[id]/helpdesk/tickets/[recordId]";
import AgentTickets from "../../frontend/admin/src/app/platform/organizations/[id]/helpdesk/agent/tickets";
import AgentTicket from "../../frontend/admin/src/app/platform/organizations/[id]/helpdesk/agent/tickets/[recordId]";
import OwnerTickets from "../../frontend/admin/src/app/platform/organizations/[id]/helpdesk/owner/tickets";
import OwnerTicket from "../../frontend/admin/src/app/platform/organizations/[id]/helpdesk/owner/tickets/[recordId]";
import TicketAssign from "../../frontend/admin/src/app/platform/organizations/[id]/helpdesk/owner/tickets/[recordId]/assign";

it.each([
  [Hub, "hub"], [Queues, "directory:queues"], [QueueCreate, "queue:create"],
  [QueueDetail, "queue:detail"], [QueueEdit, "queue:edit"], [Agents, "directory:agents"],
  [AgentAssign, "agent:assign"], [Tickets, "directory:tickets"], [TicketCreate, "ticket:create"],
  [TicketDetail, "ticket:tickets"], [AgentTickets, "directory:agent/tickets"],
  [AgentTicket, "ticket:agent/tickets"], [OwnerTickets, "directory:owner/tickets"],
  [OwnerTicket, "ticket:owner/tickets"], [TicketAssign, "ticket:assign"],
] as const)("wires the Helpdesk route to its intended page: %s", async (Page, expected) => {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(createElement(Page)));
  expect(container.textContent).toBe(expected);
  await act(async () => root.unmount());
});
