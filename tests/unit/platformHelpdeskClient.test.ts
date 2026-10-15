import { expect, it, vi } from "vitest";
import { createHelpdeskClient } from "../../packages/api-client/services/helpdesk";

const queue = { id: 3, code: "general", name: "General", status: "active", version: 1 };
const agent = { id: 4, queue_id: 3, platform_user_id: 12, status: "active", version: 2 };
const ticket = { id: 5, queue_id: 3, subject: "Help", description: "Please help", status: "open", version: 0 };
const staffTicket = { ...ticket, requester_platform_user_id: 11, assigned_platform_user_id: 12 };
const options = { status: { active: "Active", open: "Open", pending: "Pending" } };
const meta = { current_page: 1, last_page: 2, total: 2, per_page: 1, options };
const request = vi.fn(async (path: string, schema: { parse(value: unknown): unknown }) => {
  const subject = path.includes("/agents") ? agent : path.includes("/queues") ? queue :
    path.includes("/agent/tickets") || path.includes("/owner/tickets") ? staffTicket : ticket;
  return schema.parse(path.includes("?") ? { data: [subject], meta } :
    "code" in subject ? { queue: subject, options } : "platform_user_id" in subject ? { agent: subject, options } : { ticket: subject, options });
});

it("routes every Helpdesk command through standalone transport with strict scoped arguments", async () => {
  const helpdesk = createHelpdeskClient(request);
  await helpdesk.queues(7, 2, "active");
  expect(request).toHaveBeenLastCalledWith("organizations/7/helpdesk/queues?page=2&status=active", expect.anything());
  await helpdesk.queue(7, 3);
  await helpdesk.createQueue(7, { code: "general", name: "General" });
  await helpdesk.updateQueue(7, 3, { name: "General", status: "active", expected_version: 1 });
  await helpdesk.agents(7, 1, "3", "active");
  expect(request).toHaveBeenLastCalledWith("organizations/7/helpdesk/agents?page=1&queue_id=3&status=active", expect.anything());
  await helpdesk.assignAgent(7, { queue_id: 3, target_platform_user_id: 12 });
  await helpdesk.revokeAgent(7, 4, { expected_version: 2 });
  const summaries = await helpdesk.requesterTickets(7, 1, "3", "open");
  expect(summaries.data[0]).not.toHaveProperty("description");
  await helpdesk.requesterTicket(7, 5);
  await helpdesk.createTicket(7, { queue_id: 3, subject: "Help", description: "Please help" });
  await helpdesk.agentTickets(7);
  await helpdesk.agentTicket(7, 5);
  await helpdesk.changeAgentTicketStatus(7, 5, { status: "pending", expected_version: 0 });
  await helpdesk.ownerTickets(7);
  await helpdesk.ownerTicket(7, 5);
  await helpdesk.assignTicket(7, 5, { assigned_platform_user_id: 12, expected_version: 0 });
  await helpdesk.changeOwnerTicketStatus(7, 5, { status: "pending", expected_version: 0 });
  expect(request).toHaveBeenLastCalledWith("organizations/7/helpdesk/owner/tickets/5/status", expect.anything(), "POST",
    { status: "pending", expected_version: 0 });
  await helpdesk.agents(7);
  await helpdesk.requesterTickets(7);
  await helpdesk.agentTickets(7, 1, "3");
  await helpdesk.ownerTickets(7, 1, "3");
  expect(request).toHaveBeenCalledTimes(21);
});

it("rejects malformed identifiers, versions, and extra client authority fields before transport", () => {
  request.mockClear();
  const helpdesk = createHelpdeskClient(request);
  expect(() => helpdesk.queue("other", 3)).toThrow();
  expect(() => helpdesk.queues(7, 0)).toThrow();
  expect(() => helpdesk.agents(7, 1, "bad")).toThrow();
  expect(() => helpdesk.createQueue(7, { code: "BAD", name: "General" })).toThrow();
  expect(() => helpdesk.assignAgent(7, { queue_id: 3, target_platform_user_id: 0 })).toThrow();
  expect(() => helpdesk.assignTicket(7, 5, { assigned_platform_user_id: 12, expected_version: -1 })).toThrow();
  expect(() => helpdesk.createTicket(7, { queue_id: 3, subject: "", description: "Please help" })).toThrow();
  expect(request).not.toHaveBeenCalled();
});
