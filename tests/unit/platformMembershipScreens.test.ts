// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "../../packages/api-client";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const params = vi.hoisted(() => ({ id: "7", memberId: "12" }));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return { router, useLocalSearchParams: () => params, useFocusEffect: (callback: () => void) => useEffect(callback, [callback]) };
});
vi.mock("@portfolio/storefront", () => ({
  useStore: () => state,
  Copy: ({ children }: { children: ReactNode }) => createElement("span", {}, children),
  Panel: ({ children }: { children: ReactNode }) => createElement("div", {}, children),
  Button: ({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) =>
    createElement("button", { onClick: onPress, disabled }, title),
  Field: ({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) =>
    createElement("input", { "aria-label": label, value, onInput: (event: React.FormEvent<HTMLInputElement>) => onChangeText(event.currentTarget.value) }),
}));
vi.mock("../../frontend/admin/src/screens/admin_shell_screen", () => ({
  AdminPage: ({ children }: { children: ReactNode }) => createElement("main", {}, children),
}));

import { MembershipsList } from "../../frontend/admin/src/screens/memberships_list_screen";
import { MembershipDetail } from "../../frontend/admin/src/screens/membership_detail_screen";
import { Create } from "../../frontend/admin/src/screens/membership_create_screen";
import { Edit } from "../../frontend/admin/src/screens/membership_edit_screen";
import { OrganizationDetail } from "../../frontend/admin/src/screens/organization_detail_screen";
import { useMembershipDetail } from "../../frontend/admin/src/screens/membership_detail_screen/logic/useMembershipDetail";
import { Form } from "../../frontend/admin/src/screens/membership_form_screen";
import { useMembershipsList } from "../../frontend/admin/src/screens/memberships_list_screen/logic/useMembershipsList";

const membership = { id: 12, role: "member", status: "invited", version: 2, user: { id: 3, name: "Taylor", kind: "shop" } };
const options = { role: { member: "Member", admin: "Administrator", owner: "Owner" }, status: { invited: "Invited", active: "Active", revoked: "Revoked" } };
const workspace = {
  memberships: vi.fn(async () => ({ data: [membership], meta: {
    organization_id: 7, current_page: 1, last_page: 2, total: 2, per_page: 1, can_manage: true, options,
  } })),
  membership: vi.fn(async () => ({ organization_id: 7, membership, options, can_manage: true })),
  organization: vi.fn(async () => ({ organization: { id: 7, name: "North", code: "north", status: "active" },
    options: { status: { active: "Active" } }, can_update: true })),
  invite: vi.fn(async () => ({ organization_id: 7, membership, options, can_manage: true })),
  changeRole: vi.fn(async () => ({ organization_id: 7, membership, options, can_manage: true })),
  revoke: vi.fn(async () => ({ organization_id: 7, membership, options, can_manage: true })),
  accept: vi.fn(async () => ({ organization_id: 7, membership, options, can_manage: false })),
};
const state = {
  shop: "fashion",
  user: { id: 3 } as { id: number } | null,
  busy: false,
  api: { platformWorkspace: workspace },
  run: async (callback: () => Promise<void>) => { try { await callback(); return true; } catch { return false; } },
};
beforeEach(() => {
  vi.clearAllMocks();
  state.user = { id: 3 };
  workspace.memberships.mockImplementation(async () => ({ data: [membership], meta: {
    organization_id: 7, current_page: 1, last_page: 2, total: 2, per_page: 1, can_manage: true, options,
  } }));
  workspace.membership.mockImplementation(async () => ({ organization_id: 7, membership, options, can_manage: true }));
  workspace.organization.mockImplementation(async () => ({ organization: { id: 7, name: "North", code: "north", status: "active" },
    options: { status: { active: "Active" } }, can_update: true }));
});
async function render(element: React.ReactElement) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => { root.render(element); await Promise.resolve(); });
  const button = (label: string) => Array.from(container.querySelectorAll("button"))
    .find((item) => item.textContent?.includes(label))!;
  return { container, root, button };
}
async function click(button: HTMLButtonElement) {
  await act(async () => { button.click(); await Promise.resolve(); });
}
async function fill(input: HTMLInputElement, value: string) {
  await act(async () => { input.value = value; input.dispatchEvent(new Event("input", { bubbles: true })); });
}

it("lists members with owner guidance, indexed filters, and bounded pages", async () => {
  const view = await render(createElement(MembershipsList));
  expect(view.container.textContent).toContain("Taylor · Member · Invited");
  await click(view.button("Status:"));
  expect(workspace.memberships).toHaveBeenLastCalledWith("7", 1, "invited", "");
  await click(view.button("Role:"));
  expect(workspace.memberships).toHaveBeenLastCalledWith("7", 1, "invited", "member");
  await click(view.button("Next"));
  expect(workspace.memberships).toHaveBeenLastCalledWith("7", 2, "invited", "member");
  await click(view.button("Previous"));
  expect(workspace.memberships).toHaveBeenLastCalledWith("7", 1, "invited", "member");
  await click(view.button("View Taylor"));
  expect(router.push).toHaveBeenCalledWith("/organizations/7/memberships/12");
  await click(view.button("Invite member"));
  expect(router.push).toHaveBeenCalledWith("/organizations/7/memberships/create");
  await act(async () => view.root.unmount());
  workspace.memberships.mockImplementation(async () => ({ data: [], meta: {
    organization_id: 7, current_page: 1, last_page: 1, total: 0, per_page: 20, can_manage: false, options,
  } }));
  const reader = await render(createElement(MembershipsList));
  expect(reader.container.textContent).toContain("No members");
  expect(reader.container.textContent).not.toContain("Invite member");
  await act(async () => reader.root.unmount());
});

it("shares the full-page form for invite and role edit with version checks", async () => {
  const create = await render(createElement(Create));
  await click(create.button("Send invitation"));
  expect(workspace.invite).not.toHaveBeenCalled();
  expect(create.container.textContent).toContain("Enter a valid existing user ID");
  await fill(create.container.querySelector("input")!, "42");
  await click(create.button("Role:"));
  await click(create.button("Send invitation"));
  expect(workspace.invite).toHaveBeenCalledWith("7", { user_id: 42, role: "admin" });
  expect(router.replace).toHaveBeenCalledWith("/organizations/7/memberships/12");
  await act(async () => create.root.unmount());
  const edit = await render(createElement(Edit));
  await click(edit.button("Role:"));
  await click(edit.button("Save role"));
  expect(workspace.changeRole).toHaveBeenCalledWith("7", 12, { role: "admin", expected_version: 2 });
  await click(edit.button("Cancel"));
  expect(router.replace).toHaveBeenLastCalledWith("/organizations/7/memberships/12");
  await act(async () => edit.root.unmount());
});

it("shows server validation, current recipient acceptance, and owner revocation", async () => {
  workspace.invite.mockRejectedValueOnce(new ApiError("Invalid", 422, "validation", { user_id: ["Unavailable"] }));
  const create = await render(createElement(Create));
  await fill(create.container.querySelector("input")!, "42");
  await click(create.button("Send invitation"));
  expect(create.container.textContent).toContain("Unavailable");
  await act(async () => create.root.unmount());
  const detail = await render(createElement(MembershipDetail));
  await click(detail.button("Accept invitation"));
  expect(workspace.accept).toHaveBeenCalledWith("7", "12", { expected_version: 2 });
  await click(detail.button("Revoke access"));
  expect(workspace.revoke).toHaveBeenCalledWith("7", "12", { expected_version: 2 });
  expect(router.replace).toHaveBeenCalledWith("/organizations/7/memberships");
  await act(async () => detail.root.unmount());
});

it("hides owner actions for readers and keeps guests off member requests", async () => {
  workspace.membership.mockImplementation(async () => ({ organization_id: 7, membership: {
    ...membership, status: "active", user: { id: 4, name: "Robin", kind: "shop" },
  }, options, can_manage: false }));
  const reader = await render(createElement(MembershipDetail));
  expect(reader.container.textContent).not.toContain("Revoke access");
  expect(reader.container.textContent).not.toContain("Accept invitation");
  await act(async () => reader.root.unmount());
  state.user = null;
  const guest = await render(createElement(MembershipsList));
  expect(guest.container.textContent).toContain("Sign in");
  expect(workspace.memberships).not.toHaveBeenCalled();
  await act(async () => guest.root.unmount());
});

it("retries failed reads and navigates safely from member pages", async () => {
  workspace.memberships.mockRejectedValueOnce(new Error("offline"));
  const list = await render(createElement(MembershipsList));
  expect(list.container.textContent).toContain("Could not load members");
  await click(list.button("Retry"));
  expect(list.container.textContent).toContain("Taylor");
  await click(list.button("Previous"));
  expect(workspace.memberships).toHaveBeenLastCalledWith("7", 1, "", "");
  await click(list.button("Organization"));
  expect(router.replace).toHaveBeenCalledWith("/organizations/7");
  await act(async () => list.root.unmount());
  workspace.membership.mockRejectedValueOnce(new Error("offline"));
  const detail = await render(createElement(MembershipDetail));
  expect(detail.container.textContent).toContain("Could not load member");
  await click(detail.button("Retry"));
  expect(detail.container.textContent).toContain("Taylor");
  await click(detail.button("Change role"));
  expect(router.push).toHaveBeenCalledWith("/organizations/7/memberships/12/edit");
  await click(detail.button("Members"));
  expect(router.replace).toHaveBeenCalledWith("/organizations/7/memberships");
  await act(async () => detail.root.unmount());
});

it("keeps owner forms unavailable to readers and handles missing account ID", async () => {
  workspace.memberships.mockImplementation(async () => ({ data: [], meta: {
    organization_id: 7, current_page: 1, last_page: 1, total: 0, per_page: 20, can_manage: false, options,
  } }));
  const createDenied = await render(createElement(Create));
  expect(createDenied.container.textContent).toContain("Only an organization owner");
  await act(async () => createDenied.root.unmount());
  workspace.membership.mockImplementation(async () => ({ organization_id: 7, membership, options, can_manage: false }));
  const editDenied = await render(createElement(Edit));
  expect(editDenied.container.textContent).toContain("Only an organization owner");
  await act(async () => editDenied.root.unmount());
  state.user = null;
  const guest = await render(createElement(Create));
  expect(guest.container.textContent).toContain("Sign in");
  await act(async () => guest.root.unmount());
});

it("shows safe labels for missing principals and unsupported values, then hides actions after revocation", async () => {
  workspace.membership.mockImplementation(async () => ({ organization_id: 7, membership: {
    ...membership, user: null, role: "legacy", status: "revoked",
  }, options, can_manage: true }));
  const revoked = await render(createElement(MembershipDetail));
  expect(revoked.container.textContent).toContain("Unavailable user");
  expect(revoked.container.textContent).toContain("Unsupported role");
  expect(revoked.container.textContent).toContain("Status: Revoked");
  expect(revoked.container.textContent).not.toContain("Revoke access");
  await act(async () => revoked.root.unmount());

  workspace.membership.mockImplementation(async () => ({ organization_id: 7, membership: {
    ...membership, status: "legacy",
  }, options, can_manage: false }));
  const unsupported = await render(createElement(MembershipDetail));
  expect(unsupported.container.textContent).toContain("Unsupported status");
  await act(async () => unsupported.root.unmount());

  workspace.membership.mockImplementation(async () => ({ organization_id: 7, membership: {
    ...membership, user: { id: 3, name: "Taylor", kind: "platform" }, status: "invited",
  }, options, can_manage: false }));
  const platform = await render(createElement(MembershipDetail));
  expect(platform.container.textContent).toContain("Platform account");
  expect(platform.container.textContent).not.toContain("Accept invitation");
  await act(async () => platform.root.unmount());
});

it("handles guest, loading, failed, and retry states across full member pages", async () => {
  state.user = null;
  const guestDetail = await render(createElement(MembershipDetail));
  expect(guestDetail.container.textContent).toContain("Sign in");
  const guestEdit = await render(createElement(Edit));
  expect(guestEdit.container.textContent).toContain("Sign in");
  expect(workspace.membership).not.toHaveBeenCalled();
  await act(async () => { guestDetail.root.unmount(); guestEdit.root.unmount(); });
  state.user = { id: 3 };
  let release!: (value: Awaited<ReturnType<typeof workspace.membership>>) => void;
  workspace.membership.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const loading = await render(createElement(MembershipDetail));
  expect(loading.container.textContent).toContain("Loading member");
  await act(async () => loading.root.unmount());
  await act(async () => release({ organization_id: 7, membership, options, can_manage: true }));

  workspace.membership.mockRejectedValueOnce(new Error("offline"));
  const edit = await render(createElement(Edit));
  expect(edit.container.textContent).toContain("Could not load member");
  await click(edit.button("Retry"));
  expect(edit.container.textContent).toContain("Account: Taylor");
  await act(async () => edit.root.unmount());
  workspace.memberships.mockRejectedValueOnce(new Error("offline"));
  const create = await render(createElement(Create));
  expect(create.container.textContent).toContain("Could not load member options");
  await click(create.button("Retry"));
  expect(create.container.querySelector('input[aria-label="Existing shop user ID"]')).not.toBeNull();
  await act(async () => create.root.unmount());
});

it("keeps form validation and service errors visible without submitting unsafe identifiers", async () => {
  const create = await render(createElement(Create));
  await fill(create.container.querySelector("input")!, "9007199254740993");
  await click(create.button("Send invitation"));
  expect(create.container.textContent).toContain("Enter a valid existing user ID");
  expect(workspace.invite).not.toHaveBeenCalled();
  await act(async () => create.root.unmount());

  workspace.changeRole.mockRejectedValueOnce(new ApiError("Version changed", 422, "validation", {
    role: ["Role no longer available"], expected_version: ["Refresh before retrying"],
  }));
  const edit = await render(createElement(Edit));
  await click(edit.button("Save role"));
  expect(edit.container.textContent).toContain("Role no longer available");
  expect(edit.container.textContent).toContain("Refresh before retrying");
  await act(async () => edit.root.unmount());

  workspace.invite.mockRejectedValueOnce(new Error("offline"));
  const createAgain = await render(createElement(Create));
  await fill(createAgain.container.querySelector("input")!, "42");
  await click(createAgain.button("Send invitation"));
  expect(createAgain.container.textContent).not.toContain("Unavailable");
  await click(createAgain.button("Cancel"));
  expect(router.replace).toHaveBeenLastCalledWith("/organizations/7/memberships");
  await act(async () => createAgain.root.unmount());
});

it("guards unloaded detail actions and supports read-only indexed list filters", async () => {
  let current!: ReturnType<typeof useMembershipDetail>;
  function Harness() { current = useMembershipDetail("7", "12"); return createElement("div"); }
  let release!: (value: Awaited<ReturnType<typeof workspace.membership>>) => void;
  workspace.membership.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const hook = await render(createElement(Harness));
  await act(async () => { await current.accept(); await current.revoke(); });
  expect(workspace.accept).not.toHaveBeenCalled();
  expect(workspace.revoke).not.toHaveBeenCalled();
  await act(async () => hook.root.unmount());
  await act(async () => release({ organization_id: 7, membership, options, can_manage: true }));

  workspace.memberships.mockImplementation(async () => ({ data: [{ ...membership, user: null, role: "legacy", status: "legacy" }], meta: {
    organization_id: 7, current_page: 1, last_page: 1, total: 1, per_page: 20, can_manage: false, options,
  } }));
  const list = await render(createElement(MembershipsList));
  expect(list.container.textContent).toContain("Unavailable user");
  expect(list.container.textContent).toContain("Unsupported role");
  expect(list.container.textContent).toContain("Unsupported status");
  await click(list.button("Status:"));
  expect(workspace.memberships).toHaveBeenLastCalledWith("7", 1, "active", "");
  await click(list.button("View member"));
  expect(router.push).toHaveBeenCalledWith("/organizations/7/memberships/12");
  expect(list.button("Next").disabled).toBe(true);
  await act(async () => list.root.unmount());
});

it("navigates from the organization to its membership directory", async () => {
  const view = await render(createElement(OrganizationDetail));
  await click(view.button("Members"));
  expect(router.push).toHaveBeenCalledWith("/organizations/7/memberships");
  await click(view.button("Solution purchases"));
  expect(router.push).toHaveBeenCalledWith("/organizations/7/solution-purchases");
  await click(view.button("Browse solutions"));
  expect(router.push).toHaveBeenCalledWith("/solutions/offerings");
  await act(async () => view.root.unmount());
});

it("renders missing form choices and unavailable account names safely", async () => {
  const view = await render(createElement(Form, { organizationId: "7", roles: {}, initial: { ...membership, user: null } }));
  expect(view.container.textContent).toContain("Unavailable user");
  expect(view.container.textContent).toContain("Role: Unavailable");
  expect(view.button("Save role").disabled).toBe(false);
  await click(view.button("Role:"));
  await click(view.button("Cancel"));
  expect(router.replace).toHaveBeenCalledWith("/organizations/7/memberships/12");
  await act(async () => view.root.unmount());
  const noRoles = await render(createElement(Form, { organizationId: "7", roles: {} }));
  expect(noRoles.button("Send invitation").disabled).toBe(true);
  await click(noRoles.button("Role:"));
  await act(async () => noRoles.root.unmount());
});

it("ignores unloaded and stale directory results and labels withdrawn options", async () => {
  let current!: ReturnType<typeof useMembershipsList>;
  function Harness() { current = useMembershipsList("7"); return createElement("div"); }
  let release!: (value: Awaited<ReturnType<typeof workspace.memberships>>) => void;
  workspace.memberships.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const hook = await render(createElement(Harness));
  await act(async () => { current.cycle("status"); current.cycle("role"); });
  await act(async () => hook.root.unmount());
  await act(async () => release({ data: [membership], meta: {
    organization_id: 7, current_page: 1, last_page: 1, total: 1, per_page: 20, can_manage: true, options,
  } }));

  workspace.memberships.mockImplementation(async (_id, _page, status, role) => ({ data: [membership], meta: {
    organization_id: 7, current_page: 1, last_page: 1, total: 1, per_page: 20, can_manage: true,
    options: { status: status ? {} : options.status, role: role ? {} : options.role },
  } }));
  const view = await render(createElement(MembershipsList));
  await click(view.button("Status:"));
  expect(view.container.textContent).toContain("Status: Unavailable");
  await click(view.button("Role:"));
  expect(view.container.textContent).toContain("Role: Unavailable");
  await act(async () => view.root.unmount());
});
