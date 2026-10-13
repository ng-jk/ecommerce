import type { z } from "zod";
import {
  applicationList,
  createInput,
  organizationDetail,
  organizationList,
  positiveId,
  positivePage,
  updateInput,
} from "../logic/contracts";

type Request = <T>(
  path: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  method?: string,
  body?: unknown,
) => Promise<T>;

export function createPlatformWorkspace(request: Request) {
  const prefix = "platform/organizations";
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
    updateOrganization: (id: string | number, input: z.input<typeof updateInput>) =>
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
  };
}
