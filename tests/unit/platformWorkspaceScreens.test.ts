// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "../../packages/api-client";
import { deferred } from "./reactHarness";
import type { createPlatformWorkspace } from "../../packages/api-client/services/platform_workspace";
type Workspace = ReturnType<typeof createPlatformWorkspace>;

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const params = vi.hoisted(() => ({ id: "7" }));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    router,
    useLocalSearchParams: () => params,
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]),
  };
});
vi.mock("@portfolio/storefront", () => ({
  useStore: () => state,
  Copy: ({ children }: { children: ReactNode }) =>
    createElement("span", {}, children),
  Panel: ({ children }: { children: ReactNode }) =>
    createElement("div", {}, children),
  Button: ({
    title,
    onPress,
    disabled,
  }: {
    title: string;
    onPress: () => void;
    disabled?: boolean;
  }) => createElement("button", { onClick: onPress, disabled }, title),
  Field: ({
    label,
    value,
    onChangeText,
  }: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
  }) =>
    createElement("input", {
      "aria-label": label,
      value,
      onInput: (event: React.FormEvent<HTMLInputElement>) =>
        onChangeText(event.currentTarget.value),
    }),
}));
vi.mock("../../frontend/admin/src/screens/admin_shell_screen", () => ({
  AdminPage: ({ children }: { children: ReactNode }) =>
    createElement("main", {}, children),
}));

import { OrganizationsList } from "../../frontend/admin/src/screens/organizations_list_screen";
import { OrganizationDetail } from "../../frontend/admin/src/screens/organization_detail_screen";
import { Applications } from "../../frontend/admin/src/screens/organization_applications_screen";
import { Create } from "../../frontend/admin/src/screens/organization_create_screen";
import { Edit } from "../../frontend/admin/src/screens/organization_edit_screen";
import { WorkspaceHome } from "../../frontend/admin/src/screens/workspace_home_screen";

const organization = {
  id: 7,
  code: "studio",
  name: "Studio",
  status: "active",
  version: 2,
};
const meta = { current_page: 1, last_page: 2, total: 2, per_page: 1 };
const workspace = {
  organizations: vi.fn<Workspace["organizations"]>(async () => ({
    data: [organization],
    meta: { ...meta, options: { status: { active: "Active" } } },
  })),
  createOrganization: vi.fn<Workspace["createOrganization"]>(async () => ({
    organization,
    options: { status: { active: "Active" } },
    can_update: true,
  })),
  organization: vi.fn<Workspace["organization"]>(async () => ({
    organization,
    options: { status: { active: "Active" } },
    can_update: true,
  })),
  updateOrganization: vi.fn<Workspace["updateOrganization"]>(async () => ({
    organization,
    options: { status: { active: "Active" } },
    can_update: true,
  })),
  applications: vi.fn<Workspace["applications"]>(async () => ({
    data: [
      {
        id: 1,
        application_key: "framework",
        name: "Framework",
        state: "installed",
        contract_version: "1",
      },
    ],
    meta: { ...meta, options: { state: { installed: "Installed" } } },
  })),
};
const state = {
  shop: "fashion",
  user: { id: 3, role: "customer" } as { id: number; role: string } | null,
  busy: false,
  api: { platformWorkspace: workspace },
  run: async (callback: () => Promise<void>) => {
    try {
      await callback();
      return true;
    } catch {
      return false;
    }
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  state.user = { id: 3, role: "customer" };
  state.shop = "fashion";
  params.id = "7";
  workspace.organization.mockImplementation(async () => ({
    organization,
    options: { status: { active: "Active" } },
    can_update: true,
  }));
});
async function render(element: React.ReactElement) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
    await Promise.resolve();
  });
  const button = (label: string) =>
    Array.from(container.querySelectorAll("button")).find((item) =>
      item.textContent?.includes(label),
    )!;
  return {
    container,
    root,
    button,
    rerender: async (next: React.ReactElement) => {
      await act(async () => {
        root.render(next);
        await Promise.resolve();
      });
    },
  };
}
async function click(button: HTMLButtonElement) {
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
}
async function fill(input: HTMLInputElement, value: string) {
  await act(async () => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("shows customer workspace navigation and admin extensions", async () => {
  const customer = await render(createElement(WorkspaceHome));
  expect(customer.container.textContent).toContain("Organizations");
  expect(customer.container.textContent).not.toContain("Plugins");
  await click(customer.button("Organizations"));
  expect(router.push).toHaveBeenCalledWith("/organizations");
  await click(customer.button("Dashboard"));
  expect(router.replace).toHaveBeenCalledWith("/");
  await act(async () => customer.root.unmount());
  state.user = { id: 3, role: "admin" };
  const admin = await render(createElement(WorkspaceHome));
  expect(admin.container.textContent).toContain("MiniApps");
  await click(admin.button("Plugins"));
  await click(admin.button("MiniApps"));
  expect(router.push).toHaveBeenLastCalledWith("/miniapps");
  await act(async () => admin.root.unmount());
});
it("lists organizations with server labels, status filter and pagination", async () => {
  const view = await render(createElement(OrganizationsList));
  expect(view.container.textContent).toContain("Studio · studio · Active");
  await click(view.button("Status:"));
  expect(workspace.organizations).toHaveBeenCalledWith(1, "active");
  await click(view.button("Next"));
  expect(workspace.organizations).toHaveBeenCalledWith(2, "active");
  await click(view.button("Previous"));
  expect(workspace.organizations).toHaveBeenCalledWith(1, "active");
  await click(view.button("Status:"));
  expect(workspace.organizations).toHaveBeenLastCalledWith(1, "");
  await click(view.button("View Studio"));
  expect(router.push).toHaveBeenCalledWith("/organizations/7");
  await click(view.button("Create organization"));
  expect(router.push).toHaveBeenLastCalledWith("/organizations/create");
  await click(view.button("Dashboard"));
  expect(router.replace).toHaveBeenLastCalledWith("/");
  await act(async () => view.root.unmount());
});
it("restricts editing to the owner while preserving application navigation", async () => {
  const owner = await render(createElement(OrganizationDetail));
  expect(owner.container.textContent).toContain("Status: Active");
  await click(owner.button("Edit name"));
  expect(router.push).toHaveBeenCalledWith("/organizations/7/edit");
  await click(owner.button("Organizations"));
  expect(router.replace).toHaveBeenLastCalledWith("/organizations");
  await act(async () => owner.root.unmount());
  workspace.organization.mockImplementation(async () => ({
    organization,
    options: { status: { active: "Active" } },
    can_update: false,
  }));
  const member = await render(createElement(OrganizationDetail));
  expect(member.container.textContent).not.toContain("Edit name");
  await click(member.button("Applications"));
  expect(router.push).toHaveBeenCalledWith("/organizations/7/applications");
  await act(async () => member.root.unmount());
});
it("creates and renames through the shared form with the server version", async () => {
  const create = await render(createElement(Create));
  const fields = create.container.querySelectorAll("input");
  await fill(fields[0]!, "new-code");
  await fill(fields[1]!, "New");
  await click(create.button("Create organization"));
  expect(workspace.createOrganization).toHaveBeenCalledWith({
    code: "new-code",
    name: "New",
  });
  expect(router.replace).toHaveBeenCalledWith("/organizations/7");
  await act(async () => create.root.unmount());
  const edit = await render(createElement(Edit));
  await fill(edit.container.querySelector("input")!, "Renamed");
  await click(edit.button("Save changes"));
  expect(workspace.updateOrganization).toHaveBeenCalledWith(7, {
    name: "Renamed",
    expected_version: 2,
  });
  await act(async () => edit.root.unmount());
});
it("lists available installed applications without provisioning controls", async () => {
  const view = await render(createElement(Applications));
  expect(view.container.textContent).toContain("Framework · framework");
  expect(view.container.textContent).toContain("Installed · Contract v1");
  await click(view.button("Next"));
  expect(workspace.applications).toHaveBeenCalledWith("7", 2);
  await click(view.button("Previous"));
  expect(workspace.applications).toHaveBeenCalledWith("7", 1);
  await click(view.button("Organization"));
  expect(router.replace).toHaveBeenCalledWith("/organizations/7");
  expect(view.container.textContent).not.toContain("Install application");
  await act(async () => view.root.unmount());
});
it("does not request workspace data for a guest", async () => {
  state.user = null;
  const view = await render(createElement(OrganizationsList));
  expect(view.container.textContent).toContain("Sign in");
  expect(workspace.organizations).not.toHaveBeenCalled();
  await act(async () => view.root.unmount());
});

it("renders guest and empty states for every workspace page", async () => {
  state.user = null;
  for (const component of [
    WorkspaceHome,
    Create,
    Edit,
    OrganizationDetail,
    Applications,
  ]) {
    const view = await render(createElement(component));
    expect(view.container.textContent).toContain("Sign in");
    await act(async () => view.root.unmount());
  }
  state.user = { id: 3, role: "customer" };
  workspace.organizations.mockImplementationOnce(async () => ({
    data: [],
    meta: { ...meta, options: { status: { active: "Active" } } },
  }));
  const organizations = await render(createElement(OrganizationsList));
  expect(organizations.container.textContent).toContain("No organizations");
  await act(async () => organizations.root.unmount());
  workspace.applications.mockImplementationOnce(async () => ({
    data: [],
    meta: { ...meta, options: { state: {} } },
  }));
  const applications = await render(createElement(Applications));
  expect(applications.container.textContent).toContain("No applications");
  await act(async () => applications.root.unmount());
});

it("shows a retry for failed reads and succeeds without changing the route", async () => {
  workspace.organizations.mockRejectedValueOnce(new Error("offline"));
  const list = await render(createElement(OrganizationsList));
  expect(list.container.textContent).toContain("Could not load organizations");
  await click(list.button("Retry"));
  expect(list.container.textContent).toContain("Studio");
  await act(async () => list.root.unmount());
  workspace.organization.mockRejectedValueOnce(new Error("offline"));
  const detail = await render(createElement(OrganizationDetail));
  expect(detail.container.textContent).toContain("Could not load organization");
  await click(detail.button("Retry"));
  expect(detail.container.textContent).toContain("Studio");
  await act(async () => detail.root.unmount());
  workspace.organization.mockRejectedValueOnce(new Error("offline"));
  const edit = await render(createElement(Edit));
  expect(edit.container.textContent).toContain("Could not load organization");
  await click(edit.button("Retry"));
  expect(edit.container.textContent).toContain("Save changes");
  await act(async () => edit.root.unmount());
  workspace.applications.mockRejectedValueOnce(new Error("offline"));
  const applications = await render(createElement(Applications));
  expect(applications.container.textContent).toContain(
    "Could not load applications",
  );
  await click(applications.button("Retry"));
  expect(applications.container.textContent).toContain("Framework");
  await act(async () => applications.root.unmount());
});

it("keeps pending reads off a closed screen", async () => {
  const pending =
    deferred<Awaited<ReturnType<typeof workspace.organizations>>>();
  workspace.organizations.mockImplementationOnce(() => pending.promise);
  const view = await render(createElement(OrganizationsList));
  expect(view.container.textContent).toContain("Loading organizations");
  await act(async () => view.root.unmount());
  await act(async () => {
    pending.resolve({
      data: [organization],
      meta: { ...meta, options: { status: { active: "Active" } } },
    });
    await Promise.resolve();
  });
  const pendingDetail =
    deferred<Awaited<ReturnType<typeof workspace.organization>>>();
  workspace.organization.mockImplementationOnce(() => pendingDetail.promise);
  const detail = await render(createElement(OrganizationDetail));
  expect(detail.container.textContent).toContain("Loading organization");
  await act(async () => detail.root.unmount());
  await act(async () => {
    pendingDetail.resolve({
      organization,
      options: { status: { active: "Active" } },
      can_update: true,
    });
    await Promise.resolve();
  });
  const pendingEdit =
    deferred<Awaited<ReturnType<typeof workspace.organization>>>();
  workspace.organization.mockImplementationOnce(() => pendingEdit.promise);
  const edit = await render(createElement(Edit));
  expect(edit.container.textContent).toContain("Loading organization");
  await act(async () => edit.root.unmount());
  await act(async () => {
    pendingEdit.resolve({
      organization,
      options: { status: { active: "Active" } },
      can_update: true,
    });
    await Promise.resolve();
  });
  const pendingApplications =
    deferred<Awaited<ReturnType<typeof workspace.applications>>>();
  workspace.applications.mockImplementationOnce(
    () => pendingApplications.promise,
  );
  const applications = await render(createElement(Applications));
  expect(applications.container.textContent).toContain("Loading applications");
  await act(async () => applications.root.unmount());
  await act(async () => {
    pendingApplications.resolve({
      data: [],
      meta: { ...meta, options: { state: {} } },
    });
    await Promise.resolve();
  });
});

it("keeps form field errors and safe cancellation visible", async () => {
  workspace.createOrganization.mockRejectedValueOnce(
    new ApiError("Invalid", 422, "validation", {
      code: ["Already used"],
      name: ["Required"],
    }),
  );
  const create = await render(createElement(Create));
  await click(create.button("Create organization"));
  expect(create.container.textContent).toContain("Already used");
  expect(create.container.textContent).toContain("Required");
  await click(create.button("Cancel"));
  expect(router.replace).toHaveBeenLastCalledWith("/organizations");
  await act(async () => create.root.unmount());
  workspace.updateOrganization.mockRejectedValueOnce(
    new ApiError("Stale", 409, "conflict", { expected_version: ["Refresh"] }),
  );
  const edit = await render(createElement(Edit));
  await click(edit.button("Save changes"));
  expect(edit.container.textContent).toContain("Refresh");
  await click(edit.button("Cancel"));
  expect(router.replace).toHaveBeenLastCalledWith("/organizations/7");
  await act(async () => edit.root.unmount());
});

it("does not label unknown server enum values and handles unavailable filters", async () => {
  workspace.organizations.mockImplementationOnce(async () => ({
    data: [{ ...organization, status: "future" }],
    meta: { ...meta, options: { status: {} } },
  }));
  const list = await render(createElement(OrganizationsList));
  expect(list.container.textContent).toContain("Unsupported status");
  await click(list.button("Status:"));
  expect(workspace.organizations).toHaveBeenLastCalledWith(1, "");
  await act(async () => list.root.unmount());
  workspace.organization.mockImplementationOnce(async () => ({
    organization: { ...organization, status: "future" },
    options: { status: {} },
    can_update: false,
  }));
  const detail = await render(createElement(OrganizationDetail));
  expect(detail.container.textContent).toContain("Unsupported status");
  await act(async () => detail.root.unmount());
  workspace.organization.mockImplementationOnce(async () => ({
    organization,
    options: { status: { active: "Active" } },
    can_update: false,
  }));
  const edit = await render(createElement(Edit));
  expect(edit.container.textContent).toContain("Only the organization owner");
  await act(async () => edit.root.unmount());
  workspace.applications.mockImplementationOnce(async () => ({
    data: [
      {
        id: 1,
        application_key: "framework",
        name: "Framework",
        state: "future",
        contract_version: "1",
      },
    ],
    meta: { ...meta, options: { state: {} } },
  }));
  const applications = await render(createElement(Applications));
  expect(applications.container.textContent).toContain("Unsupported state");
  await act(async () => applications.root.unmount());
});

it("shows a compatibility label if filter metadata changes between pages", async () => {
  workspace.organizations.mockImplementationOnce(async () => ({
    data: [organization],
    meta: { ...meta, options: { status: { active: "Active" } } },
  }));
  workspace.organizations.mockImplementationOnce(async () => ({
    data: [organization],
    meta: { ...meta, options: { status: {} } },
  }));
  const view = await render(createElement(OrganizationsList));
  await click(view.button("Status:"));
  expect(view.container.textContent).toContain("Unavailable");
  await click(view.button("Status:"));
  expect(workspace.organizations).toHaveBeenLastCalledWith(1, "");
  await act(async () => view.root.unmount());
});

it("leaves field errors empty for non-validation failures", async () => {
  workspace.createOrganization.mockRejectedValueOnce(new Error("offline"));
  const create = await render(createElement(Create));
  await click(create.button("Create organization"));
  expect(create.container.textContent).not.toContain("Already used");
  await act(async () => create.root.unmount());
});
