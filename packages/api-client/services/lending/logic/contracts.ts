import { z } from "zod";

const positive = z.number().int().positive();
const version = z.number().int().nonnegative();
const bounded = positive.max(1_000_000_000);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });
export const lendingId = z.coerce.number().int().positive();
export const lendingPage = positive.max(1_000_000);
const options = z.record(z.string());
const pagination = z.object({
  current_page: lendingPage,
  last_page: lendingPage,
  per_page: positive.max(50),
  total: z.number().int().nonnegative(),
  options,
});
const productFields = z.object({
  name: z.string().trim().min(1).max(200),
  jurisdiction_label: z.string().trim().min(1).max(120),
  terms_text: z.string().trim().min(1).max(4000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  minor_unit_digits: z.number().int().min(0).max(4),
  principal_min_minor: bounded,
  principal_max_minor: bounded,
  term_rate_numerator: z.number().int().min(0).max(1_000_000),
  term_rate_denominator: positive.max(1_000_000),
  installment_count: positive.max(120),
  interval_days: positive.max(365),
});
const validProduct = (value: z.infer<typeof productFields>) =>
  value.principal_max_minor >= value.principal_min_minor &&
  value.term_rate_numerator <= value.term_rate_denominator &&
  value.installment_count * value.interval_days <= 3650;
export const createProduct = productFields
  .extend({ code: z.string().regex(/^[a-z][a-z0-9-]{0,59}$/) })
  .strict()
  .refine(validProduct);
export const updateProduct = productFields
  .extend({ expected_version: version, status: z.string().min(1) })
  .strict()
  .refine(validProduct);
export const productSummary = z.object({
  id: positive,
  code: z.string(),
  name: z.string(),
  jurisdiction_label: z.string(),
  currency: z.string(),
  minor_unit_digits: z.number().int(),
  principal_min_minor: z.number().int(),
  principal_max_minor: z.number().int(),
  status: z.string(),
  version,
});
export type LendingProductSummary = z.infer<typeof productSummary>;
export const product = productSummary.extend({
  terms_text: z.string(),
  term_rate_numerator: z.number().int(),
  term_rate_denominator: z.number().int(),
  installment_count: z.number().int(),
  interval_days: z.number().int(),
});
export type LendingProduct = z.infer<typeof product>;
export const productsList = z.object({
  data: z.array(productSummary),
  meta: pagination,
});
export const productDetail = z.object({ product, options });
const terms = z.object({
  principal_minor: bounded,
  first_due_date: date,
  purpose: z.string().trim().min(1).max(2000),
});
export const createApplication = terms
  .extend({ product_id: positive })
  .strict();
export const updateApplication = terms
  .extend({ expected_version: version })
  .strict();
export const expectedVersion = z.object({ expected_version: version }).strict();
export const decideReview = expectedVersion.extend({
  decision: z.enum(["approved", "rejected"]),
  decision_note: z.string().trim().min(1).max(4000),
});
export const termsSnapshot = z.object({
  product_id: positive,
  product_version: version,
  principal_minor: bounded,
  first_due_date: date,
  jurisdiction_label: z.string(),
  currency: z.string(),
  minor_unit_digits: z.number().int(),
  terms_text: z.string(),
  term_rate_numerator: z.number().int(),
  term_rate_denominator: positive,
  installment_count: positive,
  interval_days: positive,
});
export type LendingTermsSnapshot = z.infer<typeof termsSnapshot>;
export const application = z.object({
  id: positive,
  applicant_platform_user_id: positive,
  product_id: positive,
  principal_minor: positive,
  first_due_date: date,
  purpose: z.string().optional(),
  status: z.string(),
  version,
  decision_note: z.string().nullable().optional(),
  terms_snapshot: termsSnapshot.nullable().optional(),
});
export type LendingApplication = z.infer<typeof application>;
export const applicationsList = z.object({
  data: z.array(application),
  meta: pagination,
});
export const applicationDetail = z.object({ application, options });
const installment = z.object({
  number: positive,
  due_date: date,
  principal_minor: z.number().int().nonnegative(),
  charge_minor: z.number().int().nonnegative(),
  total_minor: z.number().int().nonnegative(),
});
export const schedule = z.object({
  application_id: positive,
  application_version: version,
  currency: z.string(),
  minor_unit_digits: z.number().int().min(0).max(4),
  principal_minor: positive,
  charge_minor: z.number().int().nonnegative(),
  total_minor: positive,
  installments: z.array(installment),
});
