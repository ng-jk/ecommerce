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
});
