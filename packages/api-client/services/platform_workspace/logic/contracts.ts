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
  contract_version: z.number().int().positive(),
});
export const applicationList = z.object({
  data: z.array(application),
  meta: pagination.extend({ options: z.object({ state: labels }) }),
});
export const createInput = z.object({
  code: z.string().trim().min(3).max(80).regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().trim().min(1).max(200),
});
export const updateInput = z.object({
  name: z.string().trim().min(1).max(200),
  expected_version: z.number().int().nonnegative(),
});
export const positiveId = z.coerce.number().int().positive();
export const positivePage = z.number().int().positive();
