import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { createPlatformWorkspace } from "../../packages/api-client/services/platform_workspace";

const organization = { id: 7, code: "studio", name: "Studio", status: "active", version: 2 };
const meta = { current_page: 1, last_page: 1, total: 1, per_page: 20 };
const detail = { organization, options: { status: { active: "Active" } }, can_update: true };

function fixture(body: unknown) {
  const request = vi.fn(async <T>(path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, method?: string, payload?: unknown): Promise<T> => {
    void path; void method; void payload;
    return schema.parse(body);
  });
  return { client: createPlatformWorkspace(request), request };
}

describe("platform workspace client", () => {
  it("validates typed invitations, paginated memberships and every versioned membership action", async () => {
    const member = { id: 9, role: "member", status: "invited", version: 2, user: { id: 3, name: "Recipient", kind: "platform" } };
    const options = { role: { member: "Member" }, status: { invited: "Invited" } };
    const list = fixture({ data: [member], meta: { ...meta, organization_id: 7, options, can_manage: true } });
    await list.client.memberships(7);
    await list.client.memberships(7, 2, "invited", "member");
    expect(list.request).toHaveBeenLastCalledWith("platform/organizations/7/memberships?page=2&status=invited&role=member", expect.anything());
    expect(() => list.client.memberships(7, 0)).toThrow();
    const { client, request } = fixture({ organization_id: 7, membership: member, options, can_manage: true });
    await client.membership(7, 9);
    await client.invite(7, { platform_user_id: 3, role: "member" });
    await client.invite(7, { user_id: 3, role: "member" });
    await client.changeRole(7, 9, { role: "member", expected_version: 2 });
    await client.revoke(7, 9, { expected_version: 2 });
    await client.accept(7, 9, { expected_version: 2 });
    expect(request).toHaveBeenLastCalledWith("platform/organizations/7/memberships/9/accept", expect.anything(), "POST", { expected_version: 2 });
    expect(() => client.invite(7, { user_id: 0, role: "member" })).toThrow();
    expect(() => client.changeRole(7, 9, { role: "member", expected_version: -1 })).toThrow();
    expect(request).toHaveBeenCalledTimes(6);
  });
  it("validates pagination and only sends a status when selected", async () => {
    const { client, request } = fixture({ data: [organization], meta: { ...meta, options: { status: { active: "Active" } } } });
    expect((await client.organizations()).data[0]).toEqual(organization);
    expect(request).toHaveBeenCalledWith("platform/organizations?page=1", expect.anything());
    await client.organizations(2, "active");
    expect(request).toHaveBeenCalledWith("platform/organizations?page=2&status=active", expect.anything());
    expect(() => client.organizations(0)).toThrow();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("validates create payload and owner metadata", async () => {
    const { client, request } = fixture(detail);
    expect((await client.createOrganization({ code: "studio", name: " Studio " })).can_update).toBe(true);
    expect(request).toHaveBeenCalledWith("platform/organizations", expect.anything(), "POST", { code: "studio", name: "Studio" });
    expect(() => client.createOrganization({ code: "Bad Code", name: "Studio" })).toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("uses the detail and versioned update routes", async () => {
    const { client, request } = fixture(detail);
    expect((await client.organization("7")).organization.version).toBe(2);
    await client.updateOrganization(7, { name: " New name ", expected_version: 2 });
    expect(request).toHaveBeenLastCalledWith("platform/organizations/7", expect.anything(), "PATCH", { name: "New name", expected_version: 2 });
    expect(() => client.updateOrganization(0, { name: "New", expected_version: 2 })).toThrow();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("validates application rows and rejects an invalid body", async () => {
    const valid = fixture({ data: [{ id: 9, application_key: "framework", name: "Framework", state: "installed", contract_version: 1 }], meta: { ...meta, options: { state: { installed: "Installed" } } } });
    expect((await valid.client.applications(7)).data[0]?.application_key).toBe("framework");
    expect(valid.request).toHaveBeenCalledWith("platform/organizations/7/applications?page=1", expect.anything());
    const invalid = fixture({ data: [{ id: 9, application_key: "framework" }], meta: { ...meta, options: { state: {} } } });
    await expect(invalid.client.applications(7)).rejects.toThrow();
  });

  it("paginates the provisioned catalog and validates versioned installation commands", async () => {
    const catalog = fixture({ data: [{ application_key: "crm", name: "CRM", contract_version: "1.0", available: false,
      entitled: false, state: null, version: null }], meta: { ...meta, organization_id: 7, can_manage: true,
      options: { state: { installed: "Installed" } } } });
    expect((await catalog.client.catalog(7, 2, "crm")).data[0]?.available).toBe(false);
    await catalog.client.catalog(7);
    expect(catalog.request).toHaveBeenCalledWith("platform/organizations/7/application-catalog?page=2&per_page=20&application_key=crm", expect.anything());
    await catalog.client.catalog(7, 3, "", 4);
    expect(catalog.request).toHaveBeenLastCalledWith("platform/organizations/7/application-catalog?page=3&per_page=4", expect.anything());
    expect(() => catalog.client.catalog(7, 1, "", 0)).toThrow();
    expect(() => catalog.client.catalog(7, 0)).toThrow();
    const mutation = fixture({ organization_id: 7, application: { id: 3, application_key: "crm", state: "installed", version: 0 } });
    await mutation.client.installApplication(7, "crm", { expected_version: 0 });
    await mutation.client.disableApplication(7, "crm", { expected_version: 0 });
    await mutation.client.reenableApplication(7, "crm", { expected_version: 1 });
    expect(mutation.request).toHaveBeenNthCalledWith(1, "platform/organizations/7/applications/crm/install", expect.anything(), "POST", { expected_version: 0 });
    expect(mutation.request).toHaveBeenNthCalledWith(2, "platform/organizations/7/applications/crm/disable", expect.anything(), "POST", { expected_version: 0 });
    expect(mutation.request).toHaveBeenNthCalledWith(3, "platform/organizations/7/applications/crm/reenable", expect.anything(), "POST", { expected_version: 1 });
    expect(() => mutation.client.installApplication(7, "crm", { expected_version: -1 })).toThrow();
    expect(() => mutation.client.installApplication(7, "", { expected_version: 0 })).toThrow();
  });
});
