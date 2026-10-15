import { z } from "zod";

export const organization = z.object({
  id: z.number().int().positive(),
  code: z.string(),
  name: z.string(),
  status: z.string(),
  version: z.number().int().nonnegative(),
});
export type Organization = z.infer<typeof organization>;

export const pagination = z.object({
  current_page: z.number().int().positive(),
  last_page: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  per_page: z.number().int().positive(),
});
export const labels = z.record(z.string());
export const organizationList = z.object({
  data: z.array(organization),
  meta: pagination.extend({ options: z.object({ status: labels }) }),
});
export const organizationDetail = z.object({
  organization,
  options: z.object({ status: labels }),
  can_update: z.boolean().optional(),
});
export const application = z.object({
  id: z.number().int().positive(),
  application_key: z.string(),
  name: z.string(),
  state: z.string(),
  contract_version: z.coerce.string(),
});
export const applicationList = z.object({
  data: z.array(application),
  meta: pagination.extend({ options: z.object({ state: labels }) }),
});
export const applicationCatalogItem = z.object({
  application_key: z.string().min(1),
  name: z.string(),
  contract_version: z.string(),
  available: z.boolean(),
  entitled: z.boolean(),
  state: z.enum(["installed", "disabled", "revoked"]).nullable(),
  version: z.number().int().nonnegative().nullable(),
});
export const applicationCatalog = z.object({
  data: z.array(applicationCatalogItem),
  meta: pagination.extend({
    organization_id: z.number().int().positive(),
    can_manage: z.boolean(),
    options: z.object({ state: labels }),
  }),
});
export const applicationMutation = z.object({
  organization_id: z.number().int().positive(),
  application: z.object({
    id: z.number().int().positive(),
    application_key: z.string(),
    state: z.enum(["installed", "disabled", "revoked"]),
    version: z.number().int().nonnegative(),
  }),
});
export const applicationVersion = z
  .object({ expected_version: z.number().int().nonnegative() })
  .strict();
export const createInput = z.object({
  code: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().trim().min(1).max(200),
});
export const updateInput = z.object({
  name: z.string().trim().min(1).max(200),
  expected_version: z.number().int().nonnegative(),
});
export const positiveId = z.coerce.number().int().positive();
export const positivePage = z.number().int().positive();
export const membership = z.object({
  id: z.number().int().positive(),
  role: z.string(),
  status: z.string(),
  version: z.number().int().nonnegative(),
  user: z
    .object({
      id: z.number().int().positive(),
      name: z.string(),
      kind: z.enum(["shop", "platform"]),
    })
    .nullable(),
});
export type Membership = z.infer<typeof membership>;
export const membershipOptions = z.object({ role: labels, status: labels });
export const membershipList = z.object({
  data: z.array(membership),
  meta: pagination.extend({
    organization_id: z.number().int().positive(),
    options: membershipOptions,
    can_manage: z.boolean(),
  }),
});
export const membershipDetail = z.object({
  organization_id: z.number().int().positive(),
  membership,
  options: membershipOptions,
  can_manage: z.boolean(),
});
export const inviteInput = z.union([
  z
    .object({
      user_id: z.number().int().positive(),
      role: z.string().min(1),
      expected_version: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      platform_user_id: z.number().int().positive(),
      role: z.string().min(1),
      expected_version: z.number().int().nonnegative().optional(),
    })
    .strict(),
]);
export const membershipVersion = z
  .object({ expected_version: z.number().int().nonnegative() })
  .strict();
export const membershipRoleInput = membershipVersion.extend({
  role: z.string().min(1),
});
