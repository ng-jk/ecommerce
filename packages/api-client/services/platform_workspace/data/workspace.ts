import type { z } from "zod";
import { z as schema } from "zod";
import {
  applicationList,
  applicationCatalog,
  applicationMutation,
  applicationVersion,
  createInput,
  organizationDetail,
  organizationList,
  positiveId,
  positivePage,
  updateInput,
  inviteInput,
  membershipDetail,
  membershipList,
  membershipVersion,
  membershipRoleInput,
} from "../logic/contracts";

type Request = <T>(
  path: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  method?: string,
  body?: unknown,
) => Promise<T>;

export function createPlatformWorkspace(
  request: Request,
  prefix = "platform/organizations",
) {
  return {
    organizations: (page = 1, status = "") =>
      request(
        `${prefix}?page=${positivePage.parse(page)}${status ? `&status=${encodeURIComponent(status)}` : ""}`,
        organizationList,
      ),
    createOrganization: (input: z.input<typeof createInput>) =>
      request(prefix, organizationDetail, "POST", createInput.parse(input)),
    organization: (id: string | number) =>
      request(`${prefix}/${positiveId.parse(id)}`, organizationDetail),
    updateOrganization: (
      id: string | number,
      input: z.input<typeof updateInput>,
    ) =>
      request(
        `${prefix}/${positiveId.parse(id)}`,
        organizationDetail,
        "PATCH",
        updateInput.parse(input),
      ),
    applications: (id: string | number, page = 1) =>
      request(
        `${prefix}/${positiveId.parse(id)}/applications?page=${positivePage.parse(page)}`,
        applicationList,
      ),
    catalog: (
      id: string | number,
      page = 1,
      applicationKey = "",
      perPage = 20,
    ) =>
      request(
        `${prefix}/${positiveId.parse(id)}/application-catalog?page=${positivePage.parse(page)}&per_page=${schema.number().int().min(1).max(50).parse(perPage)}${applicationKey ? `&application_key=${encodeURIComponent(schema.string().min(1).max(80).parse(applicationKey))}` : ""}`,
        applicationCatalog,
      ),
    installApplication: (
      id: string | number,
      key: string,
      input: z.input<typeof applicationVersion>,
    ) =>
      request(
        `${prefix}/${positiveId.parse(id)}/applications/${encodeURIComponent(schema.string().min(1).max(80).parse(key))}/install`,
        applicationMutation,
        "POST",
        applicationVersion.parse(input),
      ),
    disableApplication: (
      id: string | number,
      key: string,
      input: z.input<typeof applicationVersion>,
    ) =>
      request(
        `${prefix}/${positiveId.parse(id)}/applications/${encodeURIComponent(schema.string().min(1).max(80).parse(key))}/disable`,
        applicationMutation,
        "POST",
        applicationVersion.parse(input),
      ),
    reenableApplication: (
      id: string | number,
      key: string,
      input: z.input<typeof applicationVersion>,
    ) =>
      request(
        `${prefix}/${positiveId.parse(id)}/applications/${encodeURIComponent(schema.string().min(1).max(80).parse(key))}/reenable`,
        applicationMutation,
        "POST",
        applicationVersion.parse(input),
      ),
    memberships: (id: string | number, page = 1, status = "", role = "") =>
      request(
        `${prefix}/${positiveId.parse(id)}/memberships?page=${positivePage.parse(page)}${status ? `&status=${encodeURIComponent(schema.string().max(80).parse(status))}` : ""}${role ? `&role=${encodeURIComponent(schema.string().max(80).parse(role))}` : ""}`,
        membershipList,
      ),
    membership: (id: string | number, memberId: string | number) =>
      request(
        `${prefix}/${positiveId.parse(id)}/memberships/${positiveId.parse(memberId)}`,
        membershipDetail,
      ),
    invite: (id: string | number, input: z.input<typeof inviteInput>) =>
      request(
        `${prefix}/${positiveId.parse(id)}/memberships`,
        membershipDetail,
        "POST",
        inviteInput.parse(input),
      ),
    changeRole: (
      id: string | number,
      memberId: string | number,
      input: z.input<typeof membershipRoleInput>,
    ) =>
      request(
        `${prefix}/${positiveId.parse(id)}/memberships/${positiveId.parse(memberId)}`,
        membershipDetail,
        "PATCH",
        membershipRoleInput.parse(input),
      ),
    revoke: (
      id: string | number,
      memberId: string | number,
      input: z.input<typeof membershipVersion>,
    ) =>
      request(
        `${prefix}/${positiveId.parse(id)}/memberships/${positiveId.parse(memberId)}/revoke`,
        membershipDetail,
        "POST",
        membershipVersion.parse(input),
      ),
    accept: (
      id: string | number,
      memberId: string | number,
      input: z.input<typeof membershipVersion>,
    ) =>
      request(
        `${prefix}/${positiveId.parse(id)}/memberships/${positiveId.parse(memberId)}/accept`,
        membershipDetail,
        "POST",
        membershipVersion.parse(input),
      ),
  };
}
