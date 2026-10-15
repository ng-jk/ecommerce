// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "../../packages/api-client";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const routing = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), params: { id: "1", memberId: "2" } }));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return { router: routing, useLocalSearchParams: () => routing.params,
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]) };
});

const organization = { id: 1, code: "studio", name: "Studio", status: "active", version: 0 };
const membership = { id: 2, role: "member", status: "invited", version: 0,
  user: { id: 7, name: "Invitee", kind: "platform" } };
const options = { role: { member: "Member", admin: "Administrator", owner: "Owner" }, status: { active: "Active", invited: "Invited", revoked: "Revoked" } };
const api = {
  workspace: {
    organizations: vi.fn().mockResolvedValue({ data: [organization], meta: { current_page: 1, last_page: 2, total: 2, per_page: 1, options: { status: { active: "Active" } } } }),
    organization: vi.fn().mockResolvedValue({ organization, options: { status: { active: "Active" } }, can_update: true }),
    createOrganization: vi.fn().mockResolvedValue({ organization }),
    updateOrganization: vi.fn().mockResolvedValue({ organization }),
    applications: vi.fn().mockResolvedValue({ data: [{ id: 1, name: "Framework", application_key: "framework", state: "installed", contract_version: 1 }],
      meta: { current_page: 1, last_page: 1, total: 1, per_page: 20, options: { state: { installed: "Installed" } } } }),
    catalog: vi.fn().mockResolvedValue({ data: [
      { application_key: "framework", name: "Framework", contract_version: "1.0", available: true, entitled: true, state: "installed", version: 0 },
      { application_key: "crm", name: "CRM", contract_version: "1.0", available: true, entitled: true, state: null, version: null },
      { application_key: "hr", name: "HR", contract_version: "1.0", available: true, entitled: true, state: "disabled", version: 2 },
      { application_key: "erp", name: "ERP", contract_version: "1.0", available: true, entitled: true, state: "installed", version: 3 },
    ], meta: { current_page: 1, last_page: 2, total: 4, per_page: 4, organization_id: 1, can_manage: true,
      options: { state: { installed: "Installed", disabled: "Disabled" } } } }),
    installApplication: vi.fn().mockResolvedValue({ organization_id: 1, application: { id: 2, application_key: "crm", state: "installed", version: 0 } }),
    disableApplication: vi.fn().mockResolvedValue({ organization_id: 1, application: { id: 3, application_key: "erp", state: "disabled", version: 4 } }),
    reenableApplication: vi.fn().mockResolvedValue({ organization_id: 1, application: { id: 4, application_key: "hr", state: "installed", version: 3 } }),
    memberships: vi.fn().mockResolvedValue({ data: [membership], meta: { current_page: 1, last_page: 1, total: 1, per_page: 20, organization_id: 1, options, can_manage: true } }),
    membership: vi.fn().mockResolvedValue({ membership, options, can_manage: true }),
    invite: vi.fn().mockResolvedValue({ membership }),
    changeRole: vi.fn().mockResolvedValue({ membership }),
    revoke: vi.fn().mockResolvedValue({ membership }),
    accept: vi.fn().mockResolvedValue({ membership }),
  },
};
const session = {
  api, user: { id: 7, name: "Owner", email: "owner@example.test", account_status: "active" } as { id: number; name: string; email: string; account_status: string } | null,
  busy: false, loading: false, message: "", login: vi.fn().mockResolvedValue(true), register: vi.fn().mockResolvedValue(true),
  logout: vi.fn().mockResolvedValue(true), refresh: vi.fn(), clearMessage: vi.fn(),
};
vi.mock("../../frontend/admin/src/screens/platform_shell_screen", () => ({
  usePlatformSession: () => session,
  PlatformPage: ({ title, children }: { title: string; children: ReactNode }) => createElement("main", {}, createElement("h1", {}, title), children),
  PlatformText: ({ children }: { children: ReactNode }) => createElement("p", {}, children),
  PlatformButton: ({ title, onPress, disabled }: { title: string; onPress(): void; disabled?: boolean }) =>
    createElement("button", { onClick: onPress, disabled }, title),
  PlatformField: ({ label, value, onChangeText }: { label: string; value: string; onChangeText(value: string): void }) =>
    createElement("input", { "aria-label": label, value, onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChangeText(event.currentTarget.value) }),
}));

import { PlatformLogin } from "../../frontend/admin/src/screens/platform_login_screen";
import { PlatformRegister } from "../../frontend/admin/src/screens/platform_register_screen";
import { PlatformProfile } from "../../frontend/admin/src/screens/platform_profile_screen";
import { PlatformOrganizations, PlatformOrganization, PlatformApplications, PlatformOrganizationCreate, PlatformOrganizationEdit } from "../../frontend/admin/src/screens/platform_workspace_screen";
import { usePlatformApplications } from "../../frontend/admin/src/screens/platform_workspace_screen/logic/usePlatformApplications";
import { PlatformMemberships, PlatformMembership, PlatformMembershipCreate, PlatformMembershipEdit } from "../../frontend/admin/src/screens/platform_memberships_screen";
import { PlatformMembershipForm } from "../../frontend/admin/src/screens/platform_memberships_screen/interface/MembershipForm";

beforeEach(() => {
  vi.clearAllMocks();
  session.user = { id: 7, name: "Owner", email: "owner@example.test", account_status: "active" };
  session.loading = false;
});

async function render(element: React.ReactElement) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => { root.render(element); });
  const view = {
    container,
    async press(title: string) {
      const button = [...container.querySelectorAll("button")].find(item => item.textContent === title);
      expect(button, title).toBeDefined();
      await act(async () => { button?.click(); });
    },
    async fill(label: string, value: string) {
      const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
      expect(input, label).toBeTruthy();
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, value);
        input?.dispatchEvent(new Event("input", { bubbles: true }));
        input?.dispatchEvent(new Event("change", { bubbles: true }));
      });
    },
    async close() { await act(async () => root.unmount()); },
  };
  return view;
}

it("signs in and registers a platform account without selecting a shop", async () => {
  const login = await render(createElement(PlatformLogin));
  await login.fill("Email", "owner@example.test");
  await login.fill("Password", "secret");
  await login.press("Sign in");
  expect(session.login).toHaveBeenCalledWith("owner@example.test", "secret", "Commerce Studio");
  expect(routing.replace).toHaveBeenCalledWith("/platform/profile");
  await login.close();

  const register = await render(createElement(PlatformRegister));
  await register.fill("Name", "Owner");
  await register.fill("Email", "new@example.test");
  await register.fill("Password", "long-password");
  await register.fill("Confirm password", "long-password");
  await register.press("Create account");
  expect(session.register).toHaveBeenCalledWith("Owner", "new@example.test", "long-password", "long-password", "Commerce Studio");
  await register.close();
});

it("shows the current platform identity and revokes it on sign out", async () => {
  const profile = await render(createElement(PlatformProfile));
  expect(profile.container.textContent).toContain("owner@example.test");
  await profile.press("Organizations");
  expect(routing.push).toHaveBeenCalledWith("/platform/organizations");
  await profile.press("Sign out");
  expect(session.logout).toHaveBeenCalledOnce();
  expect(routing.replace).toHaveBeenCalledWith("/platform/login");
  await profile.close();
});

it("lists platform organizations and opens detail, applications and full page forms", async () => {
  const list = await render(createElement(PlatformOrganizations));
  expect(list.container.textContent).toContain("Studio · studio");
  await list.press("Create organization");
  expect(routing.push).toHaveBeenCalledWith("/platform/organizations/create");
  await list.press("Studio · studio");
  expect(routing.push).toHaveBeenCalledWith("/platform/organizations/1");
  await list.close();

  const detail = await render(createElement(PlatformOrganization));
  await detail.press("Organizations");
  await detail.press("Edit name");
  await detail.press("Applications");
  await detail.press("Members");
  await detail.press("Services");
  await detail.press("Solution purchases");
  expect(routing.push).toHaveBeenCalledWith("/platform/organizations/1/solutions");
  expect(routing.push).toHaveBeenCalledWith("/platform/organizations/1/service-hub");
  expect(routing.push).toHaveBeenCalledWith("/platform/organizations/1/memberships");
  await detail.close();

  const create = await render(createElement(PlatformOrganizationCreate));
  await create.fill("Code", "new-org");
  await create.fill("Name", "New Org");
  await create.press("Create organization");
  expect(api.workspace.createOrganization).toHaveBeenCalledWith({ code: "new-org", name: "New Org" });
  await create.close();

  const edit = await render(createElement(PlatformOrganizationEdit));
  await edit.fill("Name", "Renamed");
  await edit.press("Save changes");
  expect(api.workspace.updateOrganization).toHaveBeenCalledWith(1, { name: "Renamed", expected_version: 0 });
  await edit.close();

  const applications = await render(createElement(PlatformApplications));
  expect(applications.container.textContent).toContain("Framework");
  expect(applications.container.textContent).toContain("Application catalog");
  await applications.press("Install CRM");
  await applications.press("Disable ERP");
  await applications.press("Re-enable HR");
  expect(api.workspace.installApplication).toHaveBeenCalledWith("1", "crm", { expected_version: 0 });
  expect(api.workspace.disableApplication).toHaveBeenCalledWith("1", "erp", { expected_version: 3 });
  expect(api.workspace.reenableApplication).toHaveBeenCalledWith("1", "hr", { expected_version: 2 });
  await applications.press("Next catalog page");
  expect(api.workspace.catalog).toHaveBeenCalledWith("1", 2);
  await applications.close();
});

it("lists members and uses the platform principal for invitations, role changes and acceptance", async () => {
  const list = await render(createElement(PlatformMemberships));
  await list.press("Organization");
  await list.press("Invite member");
  await list.press("Invitee · Member");
  expect(routing.push).toHaveBeenCalledWith("/platform/organizations/1/memberships/2");
  await list.close();

  const create = await render(createElement(PlatformMembershipCreate));
  await create.fill("Platform user ID", "7");
  await create.press("Invite member");
  expect(api.workspace.invite).toHaveBeenCalledWith("1", { platform_user_id: 7, role: "member" });
  await create.close();

  const detail = await render(createElement(PlatformMembership));
  await detail.press("Members");
  await detail.press("Accept invitation");
  expect(api.workspace.accept).toHaveBeenCalledWith("1", "2", { expected_version: 0 });
  await detail.press("Revoke");
  expect(api.workspace.revoke).toHaveBeenCalledWith("1", "2", { expected_version: 0 });
  await detail.close();

  const edit = await render(createElement(PlatformMembershipEdit));
  await edit.press("Role: Member");
  await edit.press("Save role");
  expect(api.workspace.changeRole).toHaveBeenCalledWith("1", 2, { role: "admin", expected_version: 0 });
  await edit.close();
});

it("offers alternate auth routes and keeps password input on failed authentication", async () => {
  session.login.mockResolvedValueOnce(false);
  const login = await render(createElement(PlatformLogin));
  await login.press("Sign in");
  expect(routing.replace).not.toHaveBeenCalledWith("/platform/profile");
  await login.press("Create platform account");
  expect(routing.replace).toHaveBeenCalledWith("/platform/register");
  await login.close();
  session.register.mockResolvedValueOnce(false);
  const register = await render(createElement(PlatformRegister));
  await register.press("Create account");
  await register.press("Sign in instead");
  expect(routing.replace).toHaveBeenCalledWith("/platform/login");
  await register.close();
});

it("shows loading and signed-out profile states and retains the session after logout failure", async () => {
  session.loading = true;
  let view = await render(createElement(PlatformProfile));
  expect(view.container.textContent).toContain("Checking your account");
  await view.close();
  session.loading = false;
  session.user = null;
  view = await render(createElement(PlatformProfile));
  await view.press("Sign in");
  expect(routing.replace).toHaveBeenCalledWith("/platform/login");
  await view.close();
  session.user = { id: 7, name: "Owner", email: "owner@example.test", account_status: "active" };
  session.logout.mockResolvedValueOnce(false);
  routing.replace.mockClear();
  view = await render(createElement(PlatformProfile));
  await view.press("Sign out");
  expect(routing.replace).not.toHaveBeenCalledWith("/platform/login");
  await view.close();
});

it("renders organization list filters, pagination, empty, failure and signed-out states", async () => {
  let view = await render(createElement(PlatformOrganizations));
  await view.press("Status: All");
  expect(api.workspace.organizations).toHaveBeenLastCalledWith(1, "active");
  await view.press("Status: Active");
  expect(api.workspace.organizations).toHaveBeenLastCalledWith(1, "");
  await view.press("Next");
  expect(api.workspace.organizations).toHaveBeenLastCalledWith(2, "");
  await view.press("Previous");
  await view.press("Account");
  await view.close();

  api.workspace.organizations.mockResolvedValueOnce({ data: [], meta: { current_page: 1, last_page: 1, total: 0, per_page: 20, options: { status: { active: "Active" } } } });
  view = await render(createElement(PlatformOrganizations));
  expect(view.container.textContent).toContain("No organizations");
  await view.close();

  api.workspace.organizations.mockRejectedValueOnce(new Error("Offline"));
  view = await render(createElement(PlatformOrganizations));
  expect(view.container.textContent).toContain("Offline");
  await view.press("Retry");
  expect(view.container.textContent).toContain("Studio");
  await view.close();
  session.user = null;
  view = await render(createElement(PlatformOrganizations));
  await view.press("Sign in");
  expect(routing.replace).toHaveBeenCalledWith("/platform/login");
  await view.close();
});

it("handles inaccessible organization pages and application pagination", async () => {
  session.user = null;
  let view = await render(createElement(PlatformOrganization));
  await view.press("Sign in");
  await view.close();
  view = await render(createElement(PlatformOrganizationCreate));
  await view.press("Sign in");
  await view.close();
  view = await render(createElement(PlatformOrganizationEdit));
  await view.press("Sign in");
  await view.close();
  view = await render(createElement(PlatformApplications));
  await view.press("Sign in");
  await view.close();
  session.user = { id: 7, name: "Owner", email: "owner@example.test", account_status: "active" };

  api.workspace.organization.mockRejectedValueOnce(new Error("Missing"));
  view = await render(createElement(PlatformOrganization));
  expect(view.container.textContent).toContain("Missing");
  await view.press("Retry");
  await view.close();
  api.workspace.organization.mockResolvedValueOnce({ organization, options: { status: { active: "Active" } }, can_update: false });
  view = await render(createElement(PlatformOrganizationEdit));
  expect(view.container.textContent).toContain("Owner access");
  await view.close();
  api.workspace.organization.mockRejectedValueOnce(new Error("Offline"));
  view = await render(createElement(PlatformOrganizationEdit));
  await view.press("Retry");
  await view.close();
  api.workspace.catalog.mockRejectedValueOnce(new Error("Unavailable"));
  view = await render(createElement(PlatformApplications));
  await view.press("Retry catalog");
  await view.close();
});

it("handles organization form validation and cancellation", async () => {
  api.workspace.createOrganization.mockRejectedValueOnce(new ApiError("Invalid", 422, "validation", { name: ["Required"], code: ["Invalid code"], expected_version: ["Stale"] }));
  let view = await render(createElement(PlatformOrganizationCreate));
  await view.press("Create organization");
  expect(view.container.textContent).toContain("Invalid");
  expect(view.container.textContent).toContain("Required");
  expect(view.container.textContent).toContain("Invalid code");
  expect(view.container.textContent).toContain("Stale");
  await view.press("Cancel");
  expect(routing.replace).toHaveBeenCalledWith("/platform/organizations");
  await view.close();
  api.workspace.updateOrganization.mockRejectedValueOnce(new ApiError("Conflict", 409, "conflict", { name: ["Too long"] }));
  view = await render(createElement(PlatformOrganizationEdit));
  await view.press("Save changes");
  expect(view.container.textContent).toContain("Conflict");
  expect(view.container.textContent).toContain("Too long");
  await view.press("Cancel");
  expect(routing.replace).toHaveBeenCalledWith("/platform/organizations/1");
  await view.close();
});

it("handles membership filters, failures and access states", async () => {
  let view = await render(createElement(PlatformMemberships));
  await view.press("Organization");
  await view.press("Status: All");
  expect(api.workspace.memberships).toHaveBeenLastCalledWith("1", 1, "active");
  await view.press("Status: Active");
  expect(api.workspace.memberships).toHaveBeenLastCalledWith("1", 1, "invited");
  await view.press("Status: Invited");
  await view.press("Status: Revoked");
  expect(api.workspace.memberships).toHaveBeenLastCalledWith("1", 1, "");
  await view.close();
  api.workspace.memberships.mockResolvedValueOnce({ data: [membership], meta: { current_page: 1, last_page: 2, total: 2, per_page: 1, organization_id: 1, options, can_manage: true } });
  view = await render(createElement(PlatformMemberships));
  await view.press("Next");
  expect(api.workspace.memberships).toHaveBeenLastCalledWith("1", 2, "");
  await view.press("Previous");
  await view.close();
  api.workspace.memberships.mockRejectedValueOnce(new Error("Offline"));
  view = await render(createElement(PlatformMemberships));
  await view.press("Retry");
  await view.close();
  api.workspace.memberships.mockResolvedValueOnce({ data: [], meta: { current_page: 1, last_page: 1, total: 0, per_page: 20, organization_id: 1, options, can_manage: false } });
  view = await render(createElement(PlatformMemberships));
  expect(view.container.textContent).toContain("No members");
  await view.close();
  session.user = null;
  view = await render(createElement(PlatformMemberships));
  await view.press("Sign in");
  await view.close();
  view = await render(createElement(PlatformMembershipCreate));
  await view.press("Sign in");
  await view.close();
});

it("validates member invites and handles forbidden member details and forms", async () => {
  let view = await render(createElement(PlatformMembershipCreate));
  await view.press("Invite member");
  expect(view.container.textContent).toContain("Enter a valid platform user ID");
  await view.press("Role: Member");
  await view.press("Cancel");
  await view.close();
  api.workspace.invite.mockRejectedValueOnce(new ApiError("Invalid invite", 422, "validation", { platform_user_id: ["Unknown user"], role: ["Invalid role"], expected_version: ["Stale"] }));
  view = await render(createElement(PlatformMembershipCreate));
  await view.fill("Platform user ID", "77");
  await view.press("Invite member");
  expect(view.container.textContent).toContain("Unknown user");
  expect(view.container.textContent).toContain("Invalid role");
  expect(view.container.textContent).toContain("Stale");
  await view.close();
  api.workspace.memberships.mockResolvedValueOnce({ data: [], meta: { current_page: 1, last_page: 1, total: 0, per_page: 20, organization_id: 1, options, can_manage: false } });
  view = await render(createElement(PlatformMembershipCreate));
  expect(view.container.textContent).toContain("administrator access");
  await view.close();
  api.workspace.memberships.mockRejectedValueOnce(new Error("Offline"));
  view = await render(createElement(PlatformMembershipCreate));
  await view.press("Retry");
  await view.close();

  api.workspace.membership.mockResolvedValueOnce({ membership, options, can_manage: false });
  view = await render(createElement(PlatformMembershipEdit));
  expect(view.container.textContent).toContain("administrator access");
  await view.close();
  api.workspace.membership.mockRejectedValueOnce(new Error("Offline"));
  view = await render(createElement(PlatformMembershipEdit));
  await view.press("Retry");
  await view.close();
  api.workspace.changeRole.mockRejectedValueOnce(new ApiError("Invalid role", 422, "validation", { role: ["Unavailable role"] }));
  view = await render(createElement(PlatformMembershipEdit));
  await view.press("Save role");
  expect(view.container.textContent).toContain("Unavailable role");
  await view.press("Cancel");
  await view.close();
});

it("handles member action failures, signed-out and revoked states", async () => {
  session.user = null;
  let view = await render(createElement(PlatformMembership));
  await view.press("Sign in");
  await view.close();
  view = await render(createElement(PlatformMembershipEdit));
  await view.press("Sign in");
  await view.close();
  session.user = { id: 7, name: "Owner", email: "owner@example.test", account_status: "active" };
  api.workspace.membership.mockRejectedValueOnce(new Error("Missing"));
  view = await render(createElement(PlatformMembership));
  await view.press("Retry");
  await view.close();
  api.workspace.revoke.mockRejectedValueOnce(new Error("Conflict"));
  view = await render(createElement(PlatformMembership));
  await view.press("Members");
  await view.press("Edit role");
  await view.press("Revoke");
  expect(view.container.textContent).toContain("Conflict");
  await view.close();
  api.workspace.membership.mockResolvedValueOnce({ membership: { ...membership, status: "revoked" }, options, can_manage: false });
  view = await render(createElement(PlatformMembership));
  expect([...view.container.querySelectorAll("button")].some(button => button.textContent === "Revoke")).toBe(false);
  await view.close();
});

it("navigates catalog pages and shows empty and unavailable states", async () => {
  api.workspace.catalog.mockResolvedValueOnce({ data: [], meta: { current_page: 1, last_page: 2, total: 0, per_page: 20,
    organization_id: 1, can_manage: true, options: { state: {} } } });
  let view = await render(createElement(PlatformApplications));
  await view.press("Organization");
  expect(view.container.textContent).toContain("No applications on this page");
  await view.press("Next catalog page");
  expect(api.workspace.catalog).toHaveBeenLastCalledWith("1", 2);
  await view.press("Previous catalog page");
  await view.close();
  api.workspace.catalog.mockResolvedValueOnce({ data: [{ application_key: "other", name: "Unknown", contract_version: "1.0",
    available: false, entitled: false, state: "unknown", version: 0 }],
    meta: { current_page: 1, last_page: 1, total: 1, per_page: 20, organization_id: 1, can_manage: false, options: { state: {} } } });
  view = await render(createElement(PlatformApplications));
  expect(view.container.textContent).toContain("unknown");
  await view.close();
});

it("shows failed installation and prevents concurrent duplicate controls", async () => {
  api.workspace.installApplication.mockRejectedValueOnce(new Error("Install failed"));
  const view = await render(createElement(PlatformApplications));
  await view.press("Install CRM");
  expect(view.container.textContent).toContain("Install failed");
  await view.close();

  let release: (() => void) | undefined;
  api.workspace.installApplication.mockImplementationOnce(() => new Promise(resolve => {
    release = () => resolve({ organization_id: 1, application: { id: 2, application_key: "crm", state: "installed", version: 0 } });
  }));
  let model!: ReturnType<typeof usePlatformApplications>;
  function Probe() { model = usePlatformApplications("1"); return null; }
  const probe = await render(createElement(Probe));
  await act(async () => { void model.change("crm", null, null); });
  expect(model.busyKey).toBe("crm");
  await act(async () => { await model.change("crm", null, null); });
  expect(api.workspace.installApplication).toHaveBeenCalledTimes(2);
  await act(async () => { release?.(); });
  await act(async () => { await model.change("erp", "installed", null); });
  await act(async () => { await model.change("hr", "disabled", null); });
  expect(api.workspace.disableApplication).toHaveBeenCalledWith("1", "erp", { expected_version: 0 });
  expect(api.workspace.reenableApplication).toHaveBeenCalledWith("1", "hr", { expected_version: 0 });
  await probe.close();
});

it("shows controlled labels for unknown organization and membership metadata", async () => {
  api.workspace.organization.mockResolvedValueOnce({ organization: { ...organization, status: "future" }, options: { status: {} }, can_update: false });
  let view = await render(createElement(PlatformOrganization));
  expect(view.container.textContent).toContain("Unsupported status");
  await view.close();
  api.workspace.memberships.mockResolvedValueOnce({ data: [{ ...membership, role: "future", user: null }],
    meta: { current_page: 1, last_page: 1, total: 1, per_page: 20, organization_id: 1, options: { role: {}, status: {} }, can_manage: false } });
  view = await render(createElement(PlatformMemberships));
  expect(view.container.textContent).toContain("Unavailable user · Unsupported role");
  await view.close();
  api.workspace.membership.mockResolvedValueOnce({ membership: { ...membership, role: "future", status: "future", user: null }, options: { role: {}, status: {} }, can_manage: false });
  view = await render(createElement(PlatformMembership));
  expect(view.container.textContent).toContain("Unavailable user");
  expect(view.container.textContent).toContain("Unsupported role");
  expect(view.container.textContent).toContain("Unsupported status");
  await view.close();
});

it("handles missing role metadata and rejects nonnumeric invite targets", async () => {
  let view = await render(createElement(PlatformMembershipForm, { organizationId: "1", roles: {} }));
  expect(view.container.textContent).toContain("Role: Unavailable");
  await view.press("Role: Unavailable");
  await view.fill("Platform user ID", "not-a-number");
  await view.press("Invite member");
  expect(view.container.textContent).toContain("Enter a valid platform user ID");
  await view.close();
  view = await render(createElement(PlatformMembershipForm, { organizationId: "1", roles: {}, initial: { ...membership, user: null, role: "future" } }));
  expect(view.container.textContent).toContain("Unavailable user");
  await view.press("Role: Unavailable");
  await view.close();
});

it("marks changed filter labels unavailable when the server omits them", async () => {
  const organizationList = { data: [organization], meta: { current_page: 1, last_page: 1, total: 1, per_page: 20, options: { status: { active: "Active" } } } };
  api.workspace.organizations.mockResolvedValueOnce(organizationList).mockResolvedValueOnce({ ...organizationList, meta: { ...organizationList.meta, options: { status: {} } } });
  let view = await render(createElement(PlatformOrganizations));
  await view.press("Status: All");
  expect(view.container.textContent).toContain("Status: Unavailable");
  await view.close();
  const memberList = { data: [membership], meta: { current_page: 1, last_page: 1, total: 1, per_page: 20, organization_id: 1, options, can_manage: true } };
  api.workspace.memberships.mockResolvedValueOnce(memberList).mockResolvedValueOnce({ ...memberList, meta: { ...memberList.meta, options: { ...options, status: {} } } });
  view = await render(createElement(PlatformMemberships));
  await view.press("Status: All");
  expect(view.container.textContent).toContain("Status: Unavailable");
  await view.close();
});

it("shows unexpected organization and membership service errors", async () => {
  api.workspace.createOrganization.mockRejectedValueOnce(new Error("Storage unavailable"));
  let view = await render(createElement(PlatformOrganizationCreate));
  await view.press("Create organization");
  expect(view.container.textContent).toContain("Storage unavailable");
  await view.close();
  api.workspace.invite.mockRejectedValueOnce(new Error("Service unavailable"));
  view = await render(createElement(PlatformMembershipCreate));
  await view.fill("Platform user ID", "7");
  await view.press("Invite member");
  expect(view.container.textContent).toContain("Service unavailable");
  await view.close();
});
