// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "../../packages/api-client";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const routing = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), params: { id: "7", recordId: "5" } }));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return { router: routing, useLocalSearchParams: () => routing.params,
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]) };
});

const queue = { id: 3, code: "general", name: "General", status: "active", version: 0 };
const agent = { id: 4, queue_id: 3, platform_user_id: 12, status: "active", version: 0 };
const requesterTicket = { id: 5, queue_id: 3, subject: "Need help", description: "My issue", status: "open", version: 0 };
const staffTicket = { ...requesterTicket, requester_platform_user_id: 11, assigned_platform_user_id: null as number | null };
const queueOptions: { status: Record<string, string> } = { status: { active: "Active", disabled: "Disabled" } };
const agentOptions = { status: { active: "Active", revoked: "Revoked" } };
const ticketOptions = { status: { open: "Open", pending: "Pending", resolved: "Resolved", closed: "Closed" } };
const meta = { current_page: 1, last_page: 2, total: 2, per_page: 1 };
const helpdesk = {
  queues: vi.fn(async () => ({ data: [queue], meta: { ...meta, options: queueOptions } })),
  queue: vi.fn(async () => ({ queue, options: queueOptions })),
  createQueue: vi.fn(async () => ({ queue, options: queueOptions })),
  updateQueue: vi.fn(async () => ({ queue: { ...queue, version: 1 }, options: queueOptions })),
  agents: vi.fn(async () => ({ data: [agent], meta: { ...meta, options: agentOptions } })),
  assignAgent: vi.fn(async () => ({ agent, options: agentOptions })),
  revokeAgent: vi.fn(async () => ({ agent: { ...agent, status: "revoked", version: 1 }, options: agentOptions })),
  requesterTickets: vi.fn(async () => ({ data: [requesterTicket], meta: { ...meta, options: ticketOptions } })),
  requesterTicket: vi.fn(async () => ({ ticket: requesterTicket, options: ticketOptions })),
  createTicket: vi.fn(async () => ({ ticket: requesterTicket, options: ticketOptions })),
  agentTickets: vi.fn(async () => ({ data: [staffTicket], meta: { ...meta, options: ticketOptions } })),
  agentTicket: vi.fn(async () => ({ ticket: staffTicket, options: ticketOptions })),
  changeAgentTicketStatus: vi.fn(async () => ({ ticket: { ...staffTicket, status: "pending", version: 1 }, options: ticketOptions })),
  ownerTickets: vi.fn(async () => ({ data: [staffTicket], meta: { ...meta, options: ticketOptions } })),
  ownerTicket: vi.fn(async () => ({ ticket: staffTicket, options: ticketOptions })),
  assignTicket: vi.fn(async () => ({ ticket: { ...staffTicket, assigned_platform_user_id: 12, version: 1 }, options: ticketOptions })),
  changeOwnerTicketStatus: vi.fn(async () => ({ ticket: { ...staffTicket, status: "pending", version: 1 }, options: ticketOptions })),
};
const workspace = {
  organization: vi.fn(async () => ({ organization: { id: 7, name: "Org", code: "org", status: "active", version: 0 },
    options: { status: { active: "Active" } }, can_update: true })),
  memberships: vi.fn(async () => ({ data: [
    { id: 22, status: "active", role: "member", version: 0, user: { id: 12, name: "Maya", kind: "platform" } },
    { id: 23, status: "active", role: "member", version: 0, user: { id: 13, name: "Legacy", kind: "shop" } },
  ], meta: { ...meta, organization_id: 7, can_manage: true,
    options: { status: { active: "Active" }, role: { member: "Member" } } } })),
};
const session = { api: { helpdesk, workspace }, user: { id: 11 } as { id: number } | null };
vi.mock("../../frontend/admin/src/screens/platform_shell_screen", () => ({
  usePlatformSession: () => session,
  PlatformPage: ({ title, children }: { title: string; children: ReactNode }) =>
    createElement("main", {}, createElement("h1", {}, title), children),
  PlatformText: ({ children }: { children: ReactNode }) => createElement("p", {}, children),
  PlatformButton: ({ title, onPress, disabled }: { title: string; onPress(): void; disabled?: boolean }) =>
    createElement("button", { onClick: onPress, disabled }, title),
  PlatformField: ({ label, value, onChangeText }: { label: string; value: string; onChangeText(value: string): void }) =>
    createElement("input", { "aria-label": label, value, onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChangeText(event.currentTarget.value) }),
}));

import {
  HelpdeskHub, HelpdeskDirectory, HelpdeskQueueRecord, HelpdeskTicketRecord,
  HelpdeskQueueForm, HelpdeskTicketForm, HelpdeskAgentAssign, HelpdeskTicketAssign,
} from "../../frontend/admin/src/screens/platform_helpdesk_screen";
import { helpdeskBase, helpdeskPath, nextTicketStatuses } from "../../frontend/admin/src/screens/platform_helpdesk_screen/logic/model";
import type { HelpdeskDirectoryKind } from "../../frontend/admin/src/screens/platform_helpdesk_screen/logic/model";

beforeEach(() => {
  vi.clearAllMocks();
  session.user = { id: 11 };
  helpdesk.queues.mockResolvedValue({ data: [queue], meta: { ...meta, options: queueOptions } });
  helpdesk.agents.mockResolvedValue({ data: [agent], meta: { ...meta, options: agentOptions } });
  helpdesk.requesterTickets.mockResolvedValue({ data: [requesterTicket], meta: { ...meta, options: ticketOptions } });
  helpdesk.agentTickets.mockResolvedValue({ data: [staffTicket], meta: { ...meta, options: ticketOptions } });
  helpdesk.ownerTickets.mockResolvedValue({ data: [staffTicket], meta: { ...meta, options: ticketOptions } });
  helpdesk.queue.mockResolvedValue({ queue, options: queueOptions });
  helpdesk.requesterTicket.mockResolvedValue({ ticket: requesterTicket, options: ticketOptions });
  helpdesk.agentTicket.mockResolvedValue({ ticket: staffTicket, options: ticketOptions });
  helpdesk.ownerTicket.mockResolvedValue({ ticket: staffTicket, options: ticketOptions });
  workspace.organization.mockResolvedValue({ organization: { id: 7, name: "Org", code: "org", status: "active", version: 0 },
    options: { status: { active: "Active" } }, can_update: true });
});

async function render(element: React.ReactElement) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => { root.render(element); });
  const view = {
    container,
    button(label: string) { return [...container.querySelectorAll("button")].find(item => item.textContent?.includes(label))!; },
    async press(label: string) { await act(async () => { this.button(label).click(); }); },
    async fill(label: string, value: string) {
      const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    },
    async close() { await act(async () => root.unmount()); },
  };
  return view;
}

it("uses role-aware Helpdesk hub and bounded directories with server status labels", async () => {
  const hub = await render(createElement(HelpdeskHub));
  expect(hub.container.textContent).toContain("Owner desk");
  await hub.press("My tickets");
  expect(routing.push).toHaveBeenCalledWith("/platform/organizations/7/helpdesk/tickets");
  await hub.press("Organization");
  expect(routing.replace).toHaveBeenCalledWith("/platform/organizations/7");
  await hub.close();
  workspace.organization.mockResolvedValueOnce({ organization: { id: 7, name: "Org", code: "org", status: "active", version: 0 },
    options: { status: { active: "Active" } }, can_update: false });
  const memberHub = await render(createElement(HelpdeskHub));
  expect(memberHub.container.textContent).not.toContain("Owner desk");
  await memberHub.close();

  for (const kind of ["queues", "agents", "tickets", "agent/tickets", "owner/tickets"] as HelpdeskDirectoryKind[]) {
    const view = await render(createElement(HelpdeskDirectory, { kind }));
    expect(view.container.textContent).toContain(kind === "queues" ? "General" : kind === "agents" ? "member 12" : "Need help");
    await view.press("Status:");
    await view.press("Next");
    const method = kind === "queues" ? helpdesk.queues : kind === "agents" ? helpdesk.agents :
      kind === "tickets" ? helpdesk.requesterTickets : kind === "agent/tickets" ? helpdesk.agentTickets : helpdesk.ownerTickets;
    expect(method).toHaveBeenCalledWith("7", 2,
      ...(kind === "queues" ? ["active"] : ["", kind === "agents" ? "active" : "open"]));
    await view.press("Previous");
    await view.press("Helpdesk");
    expect(routing.replace).toHaveBeenCalledWith(helpdeskBase("7"));
    if (kind === "agents") {
      await view.press("Revoke member");
      expect(helpdesk.revokeAgent).toHaveBeenCalledWith("7", 4, { expected_version: 0 });
      await view.press("Assign agent");
      expect(routing.push).toHaveBeenCalledWith(`${helpdeskPath("7", "agents")}/assign`);
    } else {
      await view.press(kind === "queues" ? "General" : "Need help");
      expect(routing.push).toHaveBeenCalledWith(helpdeskPath("7", kind, kind === "queues" ? 3 : 5));
    }
    await view.close();
  }
});

it("shows requester-safe ticket details and versioned agent/owner transitions", async () => {
  const queueView = await render(createElement(HelpdeskQueueRecord));
  expect(queueView.container.textContent).toContain("Active");
  await queueView.press("Edit queue");
  expect(routing.push).toHaveBeenCalledWith(`${helpdeskPath("7", "queues", 3)}/edit`);
  await queueView.close();
  const requester = await render(createElement(HelpdeskTicketRecord, { mode: "tickets" }));
  expect(requester.container.textContent).not.toContain("Requester:");
  expect(requester.container.textContent).not.toContain("Set Pending");
  await requester.close();
  const agentView = await render(createElement(HelpdeskTicketRecord, { mode: "agent/tickets" }));
  await agentView.press("Set Pending");
  expect(helpdesk.changeAgentTicketStatus).toHaveBeenCalledWith("7", 5, { status: "pending", expected_version: 0 });
  await agentView.close();
  const owner = await render(createElement(HelpdeskTicketRecord, { mode: "owner/tickets" }));
  expect(owner.container.textContent).toContain("Requester: 11");
  await owner.press("Assign agent");
  expect(routing.push).toHaveBeenCalledWith(`${helpdeskPath("7", "owner/tickets", 5)}/assign`);
  await owner.press("Set Resolved");
  expect(helpdesk.changeOwnerTicketStatus).toHaveBeenCalledWith("7", 5, { status: "resolved", expected_version: 0 });
  await owner.close();
  expect(nextTicketStatuses("closed", ticketOptions.status)).toEqual([]);
  expect(nextTicketStatuses("unknown", ticketOptions.status)).toEqual([]);
});

it("creates queues and tickets from current queue data and submits expected versions", async () => {
  const newQueue = await render(createElement(HelpdeskQueueForm));
  await newQueue.fill("Code", "GENERAL");
  await newQueue.fill("Name", "General");
  await newQueue.press("Create queue");
  expect(helpdesk.createQueue).toHaveBeenCalledWith("7", { code: "general", name: "General" });
  await newQueue.close();
  const editQueue = await render(createElement(HelpdeskQueueForm, { edit: true }));
  await editQueue.press("Status:");
  await editQueue.press("Save queue");
  expect(helpdesk.updateQueue).toHaveBeenCalledWith("7", 3, { name: "General", status: "disabled", expected_version: 0 });
  await editQueue.close();
  const createTicket = await render(createElement(HelpdeskTicketForm));
  await createTicket.press("General");
  await createTicket.fill("Subject", "Need help");
  await createTicket.fill("Description", "My issue");
  await createTicket.press("Create ticket");
  expect(helpdesk.createTicket).toHaveBeenCalledWith("7", { queue_id: 3, subject: "Need help", description: "My issue" });
  await createTicket.close();
});

it("assigns only selected platform members and current queue agents with signed numeric targets", async () => {
  const assignAgent = await render(createElement(HelpdeskAgentAssign));
  expect(assignAgent.container.textContent).not.toContain("Legacy");
  await assignAgent.press("General");
  await assignAgent.press("Maya");
  await assignAgent.press("Assign agent");
  expect(helpdesk.assignAgent).toHaveBeenCalledWith("7", { queue_id: 3, target_platform_user_id: 12 });
  await assignAgent.close();
  const assignTicket = await render(createElement(HelpdeskTicketAssign));
  await assignTicket.press("Member 12");
  await assignTicket.press("Assign ticket");
  expect(helpdesk.assignTicket).toHaveBeenCalledWith("7", "5", { assigned_platform_user_id: 12, expected_version: 0 });
  await assignTicket.close();
});

it("keeps unauthenticated and failed reads on safe pages with retry and explicit navigation", async () => {
  session.user = null;
  for (const element of [createElement(HelpdeskHub), createElement(HelpdeskDirectory, { kind: "tickets" }),
    createElement(HelpdeskQueueRecord), createElement(HelpdeskTicketRecord, { mode: "tickets" }),
    createElement(HelpdeskQueueForm), createElement(HelpdeskTicketForm),
    createElement(HelpdeskAgentAssign), createElement(HelpdeskTicketAssign)]) {
    const view = await render(element);
    expect(view.container.textContent).toMatch(/Sign in/);
    if (view.button("Sign in")) await view.press("Sign in");
    await view.close();
  }
  expect(routing.replace).toHaveBeenCalledWith("/platform/login");
  session.user = { id: 11 };
  workspace.organization.mockRejectedValueOnce(new Error("No organization"));
  const hub = await render(createElement(HelpdeskHub));
  expect(hub.container.textContent).toContain("No organization");
  await hub.press("Retry");
  await hub.press("Agent desk");
  await hub.press("Owner desk");
  await hub.press("Queues");
  await hub.press("Queue agents");
  expect(routing.push).toHaveBeenCalledWith(helpdeskPath("7", "agents"));
  await hub.close();

  helpdesk.queues.mockRejectedValueOnce(new Error("Queue unavailable"));
  const directory = await render(createElement(HelpdeskDirectory, { kind: "queues" }));
  expect(directory.container.textContent).toContain("Queue unavailable");
  await directory.press("Retry");
  await directory.press("Create queue");
  expect(routing.push).toHaveBeenCalledWith(`${helpdeskPath("7", "queues")}/create`);
  await directory.close();
  helpdesk.requesterTickets.mockResolvedValueOnce({ data: [], meta: { ...meta, options: ticketOptions } });
  const empty = await render(createElement(HelpdeskDirectory, { kind: "tickets" }));
  expect(empty.container.textContent).toContain("No records");
  await empty.press("Create ticket");
  expect(routing.push).toHaveBeenCalledWith(`${helpdeskPath("7", "tickets")}/create`);
  await empty.close();
  helpdesk.revokeAgent.mockRejectedValueOnce(new Error("Revoked elsewhere"));
  const agents = await render(createElement(HelpdeskDirectory, { kind: "agents" }));
  await agents.press("Revoke member");
  expect(agents.container.textContent).toContain("Revoked elsewhere");
  await agents.close();
});

it("shows backend errors and retry controls on details and versioned forms", async () => {
  helpdesk.queue.mockRejectedValueOnce(new Error("Queue denied"));
  const queueRecord = await render(createElement(HelpdeskQueueRecord));
  expect(queueRecord.container.textContent).toContain("Queue denied");
  await queueRecord.press("Retry");
  await queueRecord.press("Queues");
  await queueRecord.close();
  helpdesk.requesterTicket.mockRejectedValueOnce(new Error("Hidden ticket"));
  const requester = await render(createElement(HelpdeskTicketRecord, { mode: "tickets" }));
  expect(requester.container.textContent).toContain("Hidden ticket");
  await requester.press("Retry");
  await requester.press("Tickets");
  await requester.close();
  helpdesk.changeAgentTicketStatus.mockRejectedValueOnce(new Error("Version changed"));
  const agentRecord = await render(createElement(HelpdeskTicketRecord, { mode: "agent/tickets" }));
  await agentRecord.press("Set Pending");
  expect(agentRecord.container.textContent).toContain("Version changed");
  await agentRecord.close();

  helpdesk.createQueue.mockRejectedValueOnce(new ApiError("Duplicate code", 422, "invalid_body", { code: ["Already exists"] }));
  const queueForm = await render(createElement(HelpdeskQueueForm));
  await queueForm.press("Create queue");
  expect(queueForm.container.textContent).toContain("Duplicate code");
  expect(queueForm.container.textContent).toContain("code: Already exists");
  await queueForm.press("Cancel");
  await queueForm.close();
  helpdesk.queue.mockRejectedValueOnce(new Error("Queue stale"));
  const editForm = await render(createElement(HelpdeskQueueForm, { edit: true }));
  expect(editForm.container.textContent).toContain("Queue stale");
  await editForm.press("Retry");
  await editForm.press("Cancel");
  await editForm.close();
});

it("paginates selectable queues, members, and agents while keeping failures visible", async () => {
  const ticketForm = await render(createElement(HelpdeskTicketForm));
  await ticketForm.press("Next queues");
  expect(helpdesk.queues).toHaveBeenCalledWith("7", 2, "active");
  await ticketForm.press("Previous queues");
  helpdesk.createTicket.mockRejectedValueOnce(new Error("Ticket failed"));
  await ticketForm.press("General");
  await ticketForm.press("Create ticket");
  expect(ticketForm.container.textContent).toContain("Ticket failed");
  await ticketForm.press("Cancel");
  await ticketForm.close();

  const agentAssign = await render(createElement(HelpdeskAgentAssign));
  await agentAssign.press("Next queues");
  await agentAssign.press("Previous queues");
  await agentAssign.press("Next members");
  expect(workspace.memberships).toHaveBeenCalledWith("7", 2, "active");
  await agentAssign.press("Previous members");
  await agentAssign.press("General");
  await agentAssign.press("Maya");
  helpdesk.assignAgent.mockRejectedValueOnce(new Error("Membership changed"));
  await agentAssign.press("Assign agent");
  expect(agentAssign.container.textContent).toContain("Membership changed");
  await agentAssign.press("Cancel");
  await agentAssign.close();

  const ticketAssign = await render(createElement(HelpdeskTicketAssign));
  await ticketAssign.press("Next agents");
  expect(helpdesk.agents).toHaveBeenCalledWith("7", 2, "3", "active");
  await ticketAssign.press("Previous agents");
  await ticketAssign.press("Member 12");
  helpdesk.assignTicket.mockRejectedValueOnce(new Error("Agent revoked"));
  await ticketAssign.press("Assign ticket");
  expect(ticketAssign.container.textContent).toContain("Agent revoked");
  await ticketAssign.press("Cancel");
  await ticketAssign.close();
});

it("handles live assignment reactivation, failed selectable data, and retry", async () => {
  const revoked = { ...agent, status: "revoked", version: 3 };
  helpdesk.agents.mockResolvedValueOnce({ data: [revoked], meta: { ...meta, options: agentOptions } });
  const reactivate = await render(createElement(HelpdeskAgentAssign));
  await reactivate.press("General");
  await reactivate.press("Maya");
  await reactivate.press("Assign agent");
  expect(helpdesk.assignAgent).toHaveBeenCalledWith("7", {
    queue_id: 3, target_platform_user_id: 12, expected_version: 3,
  });
  await reactivate.close();

  helpdesk.queues.mockRejectedValueOnce(new Error("Queue choices unavailable"));
  workspace.memberships.mockRejectedValueOnce(new Error("Memberships unavailable"));
  const failedAgent = await render(createElement(HelpdeskAgentAssign));
  expect(failedAgent.container.textContent).toContain("Queue choices unavailable");
  expect(failedAgent.container.textContent).toContain("Memberships unavailable");
  await failedAgent.press("Retry queues");
  await failedAgent.press("Retry members");
  await failedAgent.close();

  helpdesk.ownerTicket.mockRejectedValueOnce(new Error("Ticket no longer visible"));
  const failedTicket = await render(createElement(HelpdeskTicketAssign));
  expect(failedTicket.container.textContent).toContain("Ticket no longer visible");
  await failedTicket.press("Retry ticket");
  await failedTicket.close();
  helpdesk.agents.mockRejectedValueOnce(new Error("Roster unavailable"));
  const failedRoster = await render(createElement(HelpdeskTicketAssign));
  expect(failedRoster.container.textContent).toContain("Roster unavailable");
  await failedRoster.press("Retry agents");
  await failedRoster.close();

  helpdesk.queues.mockRejectedValueOnce(new Error("No active queues"));
  const failedCreate = await render(createElement(HelpdeskTicketForm));
  expect(failedCreate.container.textContent).toContain("No active queues");
  await failedCreate.press("Retry queues");
  await failedCreate.close();
});

it("keeps unsupported server statuses legible and cycles filters back to all", async () => {
  helpdesk.queues.mockImplementation(async () => ({ data: [queue], meta: { ...meta, options: { status: { active: "Active" } } } }));
  const directory = await render(createElement(HelpdeskDirectory, { kind: "queues" }));
  await directory.press("Status: All");
  await directory.press("Status: Active");
  expect(helpdesk.queues).toHaveBeenLastCalledWith("7", 1, "");
  await directory.close();
  helpdesk.queues.mockResolvedValueOnce({ data: [{ ...queue, status: "retired" }], meta: { ...meta, options: queueOptions } });
  const unsupportedQueue = await render(createElement(HelpdeskDirectory, { kind: "queues" }));
  expect(unsupportedQueue.container.textContent).toContain("Unavailable");
  await unsupportedQueue.close();
  helpdesk.agents.mockResolvedValueOnce({ data: [{ ...agent, status: "retired" }], meta: { ...meta, options: agentOptions } });
  const unsupportedAgent = await render(createElement(HelpdeskDirectory, { kind: "agents" }));
  expect(unsupportedAgent.container.textContent).toContain("Unavailable");
  await unsupportedAgent.close();
  helpdesk.requesterTickets.mockResolvedValueOnce({ data: [{ ...requesterTicket, status: "retired" }], meta: { ...meta, options: ticketOptions } });
  const unsupportedTicket = await render(createElement(HelpdeskDirectory, { kind: "tickets" }));
  expect(unsupportedTicket.container.textContent).toContain("Unavailable");
  await unsupportedTicket.close();
  helpdesk.queue.mockResolvedValueOnce({ queue: { ...queue, status: "retired" }, options: queueOptions });
  const queueRecord = await render(createElement(HelpdeskQueueRecord));
  expect(queueRecord.container.textContent).toContain("Unavailable");
  await queueRecord.close();
  helpdesk.requesterTicket.mockResolvedValueOnce({ ticket: { ...requesterTicket, status: "retired" }, options: ticketOptions });
  const ticketRecord = await render(createElement(HelpdeskTicketRecord, { mode: "tickets" }));
  expect(ticketRecord.container.textContent).toContain("Unavailable");
  await ticketRecord.close();

  helpdesk.queues.mockReset();
  helpdesk.queues.mockResolvedValueOnce({ data: [queue], meta: { ...meta, options: queueOptions } })
    .mockResolvedValue({ data: [queue], meta: { ...meta, options: { status: {} } } });
  const missingFilterLabel = await render(createElement(HelpdeskDirectory, { kind: "queues" }));
  await missingFilterLabel.press("Status: All");
  expect(missingFilterLabel.container.textContent).toContain("Status: Unavailable");
  await missingFilterLabel.close();

  helpdesk.queue.mockResolvedValueOnce({ queue, options: { status: {} } });
  const missingFormLabel = await render(createElement(HelpdeskQueueForm, { edit: true }));
  expect(missingFormLabel.container.textContent).toContain("Status: Unavailable");
  await missingFormLabel.press("Status: Unavailable");
  expect(missingFormLabel.container.textContent).toContain("Status: Unavailable");
  await missingFormLabel.close();

  helpdesk.ownerTicket.mockResolvedValueOnce({ ticket: { ...staffTicket, assigned_platform_user_id: 12 }, options: ticketOptions });
  const assignedRecord = await render(createElement(HelpdeskTicketRecord, { mode: "owner/tickets" }));
  expect(assignedRecord.container.textContent).toContain("Assigned agent: 12");
  await assignedRecord.close();
});
