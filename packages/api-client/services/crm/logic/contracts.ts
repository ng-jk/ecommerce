import { z } from "zod";

const id = z.number().int().positive();
export const crmId = z.coerce.number().int().positive();
export const crmPage = z.number().int().positive();
const version = z.number().int().nonnegative();
const pagination = z.object({
  current_page: crmPage,
  last_page: crmPage,
  total: z.number().int().nonnegative(),
  per_page: crmPage,
});
const code = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-z][a-z0-9-]*$/);
const name = z.string().trim().min(1).max(200);
const email = z.string().trim().email().max(254);
const companyId = id.nullable();
const expectedVersion = z.object({ expected_version: version }).strict();

export const company = z.object({
  id,
  code: z.string(),
  name: z.string(),
  version,
});
export type CrmCompany = z.infer<typeof company>;
export const contact = z.object({
  id,
  company_id: companyId,
  name: z.string(),
  email: z.string(),
  version,
});
export type CrmContact = z.infer<typeof contact>;
export const lead = z.object({
  id,
  company_id: companyId,
  contact_id: id.nullable(),
  name: z.string(),
  email: z.string(),
  status: z.string(),
  version,
});
export type CrmLead = z.infer<typeof lead>;
export const leadOptions = z.object({ status: z.record(z.string()) });
export const companiesList = z.object({
  data: z.array(company),
  meta: pagination,
});
export const contactsList = z.object({
  data: z.array(contact),
  meta: pagination,
});
export const leadsList = z.object({
  data: z.array(lead),
  meta: pagination.extend({ options: leadOptions }),
});
export const companyDetail = z.object({ company });
export const contactDetail = z.object({ contact });
export const leadDetail = z.object({ lead, options: leadOptions });
export const convertedLead = leadDetail.extend({ contact });

export const createCompany = z.object({ code, name }).strict();
export const updateCompany = z
  .object({ name, expected_version: version })
  .strict();
export const createContact = z
  .object({ name, email, company_id: companyId })
  .strict();
export const updateContact = createContact.extend({
  expected_version: version,
});
export const createLead = z
  .object({ name, email, company_id: companyId })
  .strict();
export const updateLead = createLead.extend({
  status: z.string().min(1),
  expected_version: version,
});
export const convertLead = expectedVersion;

export const pipeline = z.object({
  id,
  code: z.string(),
  name: z.string(),
  version,
});
export type CrmPipeline = z.infer<typeof pipeline>;
export const stage = z.object({
  id,
  pipeline_id: id,
  code: z.string(),
  name: z.string(),
  position: id,
  outcome: z.string(),
  version,
});
export type CrmStage = z.infer<typeof stage>;
export const deal = z.object({
  id,
  pipeline_id: id,
  stage_id: id,
  company_id: companyId,
  contact_id: id.nullable(),
  assignee_platform_user_id: id.nullable(),
  title: z.string(),
  amount_minor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  currency: z.string().regex(/^[A-Z]{3}$/),
  status: z.string(),
  version,
});
export type CrmDeal = z.infer<typeof deal>;
export const activity = z.object({
  id,
  deal_id: id,
  type: z.string(),
  summary: z.string(),
  occurred_at: z.string().datetime({ offset: true }),
});
export type CrmActivity = z.infer<typeof activity>;
export const stageOptions = z.object({ outcome: z.record(z.string()) });
export const dealOptions = z.object({ status: z.record(z.string()) });
export const activityOptions = z.object({ type: z.record(z.string()) });
export const pipelinesList = z.object({
  data: z.array(pipeline),
  meta: pagination,
});
export const stagesList = z.object({
  data: z.array(stage),
  meta: pagination.extend({ options: stageOptions }),
});
export const dealsList = z.object({
  data: z.array(deal),
  meta: pagination.extend({ options: dealOptions }),
});
export const activitiesList = z.object({
  data: z.array(activity),
  meta: pagination.extend({ options: activityOptions }),
});
export const pipelineDetail = z.object({ pipeline });
export const stageDetail = z.object({ stage, options: stageOptions });
export const dealDetail = z.object({ deal, options: dealOptions });
export const activityDetail = z.object({ activity, options: activityOptions });
export const createPipeline = z.object({ code, name }).strict();
export const updatePipeline = z
  .object({ name, expected_version: version })
  .strict();
export const createStage = z
  .object({
    pipeline_id: id,
    code,
    name,
    position: id.max(1000),
    outcome: z.string().min(1),
  })
  .strict();
export const updateStage = z
  .object({ name, expected_version: version })
  .strict();
export const createDeal = z
  .object({
    pipeline_id: id,
    stage_id: id,
    title: name,
    company_id: companyId,
    contact_id: id.nullable(),
    assignee_platform_user_id: id.nullable(),
    amount_minor: z.number().int().nonnegative().max(9_000_000_000_000_000),
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict();
export const updateDeal = createDeal
  .omit({ pipeline_id: true, stage_id: true })
  .extend({ expected_version: version });
export const advanceDeal = z
  .object({ stage_id: id, expected_version: version })
  .strict();
export const createActivity = z
  .object({
    deal_id: id,
    type: z.string().min(1),
    summary: z.string().trim().min(1).max(500),
    occurred_at: z.string().datetime({ offset: true }),
  })
  .strict();
