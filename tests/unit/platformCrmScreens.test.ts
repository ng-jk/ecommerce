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
const company = { id: 5, code: "acme", name: "Acme", version: 1 };
const contact = { id: 5, company_id: 5, name: "Maya", email: "maya@example.com", version: 2 };
const lead = { id: 5, company_id: 5, contact_id: null as number | null, name: "Maya", email: "maya@example.com", status: "qualified", version: 2 };
const options = { status: { new: "New", contacted: "Contacted", qualified: "Qualified", converted: "Converted", lost: "Lost" } };
const page = { current_page: 1, last_page: 2, total: 2, per_page: 1 };
const crm = {
  companies: vi.fn(async () => ({ data: [company], meta: page })),
  contacts: vi.fn(async () => ({ data: [contact], meta: page })),
  leads: vi.fn(async () => ({ data: [lead], meta: { ...page, options } })),
  company: vi.fn(async () => ({ company })),
  contact: vi.fn(async () => ({ contact })),
  lead: vi.fn(async () => ({ lead, options })),
  createCompany: vi.fn(async () => ({ company })),
  updateCompany: vi.fn(async () => ({ company })),
  createContact: vi.fn(async () => ({ contact })),
  updateContact: vi.fn(async () => ({ contact })),
  createLead: vi.fn(async () => ({ lead })),
  updateLead: vi.fn(async () => ({ lead })),
  convertLead: vi.fn(async () => ({ lead: { ...lead, status: "converted", contact_id: 5 }, contact, options })),
};
const session = { api: { crm }, user: { id: 9 } as { id: number } | null };
vi.mock("../../frontend/admin/src/screens/platform_shell_screen", () => ({
  usePlatformSession: () => session,
  PlatformPage: ({ title, children }: { title: string; children: ReactNode }) => createElement("main", {}, createElement("h1", {}, title), children),
  PlatformText: ({ children }: { children: ReactNode }) => createElement("p", {}, children),
  PlatformButton: ({ title, onPress, disabled }: { title: string; onPress(): void; disabled?: boolean }) =>
    createElement("button", { onClick: onPress, disabled }, title),
  PlatformField: ({ label, value, onChangeText }: { label: string; value: string; onChangeText(value: string): void }) =>
    createElement("input", { "aria-label": label, value, onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChangeText(event.currentTarget.value) }),
}));

import { CrmCreatePage, CrmDirectory, CrmEditPage, CrmRecordPage } from "../../frontend/admin/src/screens/platform_crm_screen";
import { CrmForm } from "../../frontend/admin/src/screens/platform_crm_screen/interface/Form";
import { useCrmRecord } from "../../frontend/admin/src/screens/platform_crm_screen/logic/useCrmRecord";
import type { CrmKind } from "../../frontend/admin/src/screens/platform_crm_screen/logic/model";

beforeEach(() => {
  vi.clearAllMocks();
  session.user = { id: 9 };
  crm.companies.mockResolvedValue({ data: [company], meta: page });
  crm.contacts.mockResolvedValue({ data: [contact], meta: page });
  crm.leads.mockResolvedValue({ data: [lead], meta: { ...page, options } });
  crm.company.mockResolvedValue({ company });
  crm.contact.mockResolvedValue({ contact });
  crm.lead.mockResolvedValue({ lead, options });
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

it("renders and navigates every CRM directory with bounded pages and model status labels", async () => {
  for (const kind of ["companies", "contacts", "leads"] as CrmKind[]) {
    const view = await render(createElement(CrmDirectory, { kind }));
    expect(view.container.textContent).toContain(kind === "companies" ? "Acme · acme" : "Maya · maya@example.com");
    await view.press("Next");
    expect(crm[kind]).toHaveBeenLastCalledWith("7", 2, ...(kind === "leads" ? [""] : []));
    await view.press("Previous");
    await view.press(kind === "companies" ? "Acme · acme" : "Maya · maya@example.com");
    expect(routing.push).toHaveBeenCalledWith(`/platform/organizations/7/crm/${kind}/5`);
    await view.press("Create");
    expect(routing.push).toHaveBeenCalledWith(`/platform/organizations/7/crm/${kind}/create`);
    await view.press("Organization");
    expect(routing.replace).toHaveBeenCalledWith("/platform/organizations/7");
    if (kind === "leads") {
      await view.press("Status:");
      expect(crm.leads).toHaveBeenLastCalledWith("7", 1, "new");
    }
    await view.close();
  }
});

it("shows each CRM detail and converts only a qualified lead", async () => {
  for (const kind of ["companies", "contacts", "leads"] as CrmKind[]) {
    const view = await render(createElement(CrmRecordPage, { kind }));
    expect(view.container.textContent).toContain(kind === "companies" ? "Code: acme" : "Email: maya@example.com");
    await view.press("Edit");
    expect(routing.push).toHaveBeenCalledWith(`/platform/organizations/7/crm/${kind}/5/edit`);
    await view.press("All");
    expect(routing.replace).toHaveBeenCalledWith(`/platform/organizations/7/crm/${kind}`);
    if (kind === "leads") {
      expect(view.container.textContent).toContain("Status: Qualified");
      await view.press("Convert to contact");
      expect(crm.convertLead).toHaveBeenCalledWith("7", "5", { expected_version: 2 });
    }
    await view.close();
  }
  crm.lead.mockResolvedValueOnce({ lead: { ...lead, status: "converted", contact_id: 5 }, options });
  const converted = await render(createElement(CrmRecordPage, { kind: "leads" }));
  expect(converted.container.textContent).not.toContain("Convert to contact");
  await converted.press("Converted contact");
  expect(routing.push).toHaveBeenCalledWith("/platform/organizations/7/crm/contacts/5");
  await converted.close();
  crm.lead.mockResolvedValueOnce({ lead: { ...lead, status: "legacy", company_id: null }, options });
  const unavailable = await render(createElement(CrmRecordPage, { kind: "leads" }));
  expect(unavailable.container.textContent).toContain("Company ID: None");
  expect(unavailable.container.textContent).toContain("Status: Unavailable");
  await unavailable.close();
});

it("creates and edits all CRM records through full-page forms and versioned methods", async () => {
  for (const kind of ["companies", "contacts", "leads"] as CrmKind[]) {
    const create = await render(createElement(CrmCreatePage, { kind }));
    await create.fill("Name", "Maya");
    if (kind === "companies") await create.fill("Code", "ACME");
    else {
      await create.fill("Email", "maya@example.com");
      await create.fill("Company ID (optional)", "5");
    }
    await create.press("Create");
    expect(routing.replace).toHaveBeenCalledWith(`/platform/organizations/7/crm/${kind}/5`);
    await create.close();

    const edit = await render(createElement(CrmEditPage, { kind }));
    await edit.fill("Name", "Updated");
    if (kind === "leads") await edit.press("Status:");
    await edit.press("Save changes");
    expect(routing.replace).toHaveBeenCalledWith(`/platform/organizations/7/crm/${kind}/5`);
    await edit.press("Cancel");
    await edit.close();
  }
  expect(crm.createCompany).toHaveBeenCalledWith("7", { code: "acme", name: "Maya" });
  expect(crm.updateCompany).toHaveBeenCalledWith("7", 5, { name: "Updated", expected_version: 1 });
  expect(crm.createContact).toHaveBeenCalledWith("7", { name: "Maya", email: "maya@example.com", company_id: 5 });
  expect(crm.updateContact).toHaveBeenCalledWith("7", 5, { name: "Updated", email: "maya@example.com", company_id: 5, expected_version: 2 });
  expect(crm.createLead).toHaveBeenCalledWith("7", { name: "Maya", email: "maya@example.com", company_id: 5 });
  expect(crm.updateLead).toHaveBeenCalledWith("7", 5, { name: "Updated", email: "maya@example.com", company_id: 5, status: "converted", expected_version: 2 });
  const blankCompany = await render(createElement(CrmForm, { organizationId: "7", kind: "contacts",
    initial: { ...contact, company_id: null } }));
  expect(blankCompany.container.querySelector<HTMLInputElement>('input[aria-label="Company ID (optional)"]')?.value).toBe("");
  await blankCompany.close();
  const unavailableStatus = await render(createElement(CrmForm, { organizationId: "7", kind: "leads", initial: lead }));
  expect(unavailableStatus.container.textContent).toContain("Status: Unavailable");
  await unavailableStatus.press("Status:");
  await unavailableStatus.close();
});

it("keeps guests out and provides retry states without leaking another result", async () => {
  session.user = null;
  for (const kind of ["companies", "contacts", "leads"] as CrmKind[]) {
    const list = await render(createElement(CrmDirectory, { kind }));
    expect(list.container.textContent).toContain("Sign in");
    await list.press("Sign in");
    expect(routing.replace).toHaveBeenCalledWith("/platform/login");
    await list.close();
    const detail = await render(createElement(CrmRecordPage, { kind }));
    expect(detail.container.textContent).toContain("Sign in");
    await detail.press("Sign in");
    await detail.close();
    const create = await render(createElement(CrmCreatePage, { kind }));
    expect(create.container.textContent).toContain("Sign in");
    await create.close();
    const edit = await render(createElement(CrmEditPage, { kind }));
    expect(edit.container.textContent).toContain("Sign in");
    await edit.close();
  }
  expect(crm.companies).not.toHaveBeenCalled();
  session.user = { id: 9 };
  crm.companies.mockRejectedValueOnce(new Error("offline"));
  const list = await render(createElement(CrmDirectory, { kind: "companies" }));
  expect(list.container.textContent).toContain("offline");
  await list.press("Retry");
  expect(list.container.textContent).toContain("Acme");
  await list.close();
  crm.contact.mockRejectedValueOnce(new Error("offline"));
  const detail = await render(createElement(CrmRecordPage, { kind: "contacts" }));
  expect(detail.container.textContent).toContain("offline");
  await detail.press("Retry");
  expect(detail.container.textContent).toContain("Maya");
  await detail.close();
  crm.company.mockRejectedValueOnce(new Error("offline"));
  const edit = await render(createElement(CrmEditPage, { kind: "companies" }));
  expect(edit.container.textContent).toContain("offline");
  await edit.press("Retry");
  expect(edit.container.textContent).toContain("Code: acme");
  await edit.close();
});

it("shows field and conversion errors and prevents invalid company references", async () => {
  const create = await render(createElement(CrmCreatePage, { kind: "contacts" }));
  await create.fill("Name", "A");
  await create.fill("Email", "a@example.com");
  await create.fill("Company ID (optional)", "no");
  await create.press("Create");
  expect(create.container.textContent).toContain("valid company ID");
  expect(crm.createContact).not.toHaveBeenCalled();
  await create.fill("Company ID (optional)", "");
  crm.createContact.mockRejectedValueOnce(new ApiError("Invalid", 422, "validation", { email: ["Email is reserved"] }));
  await create.press("Create");
  expect(create.container.textContent).toContain("Email is reserved");
  await create.close();
  crm.convertLead.mockRejectedValueOnce(new Error("conversion offline"));
  const leadDetail = await render(createElement(CrmRecordPage, { kind: "leads" }));
  await leadDetail.press("Convert to contact");
  expect(leadDetail.container.textContent).toContain("conversion offline");
  await leadDetail.close();
  crm.updateCompany.mockRejectedValueOnce(new Error("save offline"));
  const edit = await render(createElement(CrmEditPage, { kind: "companies" }));
  await edit.press("Save changes");
  expect(edit.container.textContent).toContain("save offline");
  await edit.close();
});

it("shows empty CRM pages and recovers from withdrawn status labels", async () => {
  crm.companies.mockResolvedValue({ data: [], meta: { ...page, last_page: 1, total: 0 } });
  const empty = await render(createElement(CrmDirectory, { kind: "companies" }));
  expect(empty.container.textContent).toContain("No companies");
  await empty.close();
  crm.leads.mockImplementation(async (_org, _page, status) => ({ data: [lead], meta: {
    ...page, options: { status: status ? {} : options.status },
  } }));
  const list = await render(createElement(CrmDirectory, { kind: "leads" }));
  await list.press("Status:");
  expect(list.container.textContent).toContain("Status: Unavailable");
  await list.press("Status:");
  await list.close();
});

it("ignores conversion before a lead detail is loaded", async () => {
  let current!: ReturnType<typeof useCrmRecord>;
  function Harness() { current = useCrmRecord("7", "leads", "5"); return createElement("div"); }
  let resolve!: (value: { lead: typeof lead; options: typeof options }) => void;
  crm.lead.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const view = await render(createElement(Harness));
  await act(async () => { await current.convert(); });
  expect(crm.convertLead).not.toHaveBeenCalled();
  await view.close();
  await act(async () => resolve({ lead, options }));
});
