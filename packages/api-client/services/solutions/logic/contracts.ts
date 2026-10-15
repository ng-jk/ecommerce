import { z } from "zod";

const id = z.number().int().positive();
const page = z.number().int().positive();
const labels = z.record(z.string());

export const offering = z.object({
  id,
  product_id: id,
  application_key: z.string().min(1),
  version: id,
  unit_amount: z.number().int().positive(),
  currency: z.string().length(3),
  deliverables: z.array(z.string().min(1)),
  published_at: z.string(),
});
export type SolutionOffering = z.infer<typeof offering>;
export const offeringList = z.object({
  data: z.array(offering),
  meta: z.object({
    current_page: page,
    last_page: page,
    total: z.number().int().nonnegative(),
    per_page: page,
  }),
});
export const offeringDetail = z.object({ offering });
export const publishedOffering = z.object({
  offering: z.object({
    id,
    version: id,
    application_key: z.string(),
    unit_amount: z.number().int().positive(),
    currency: z.string(),
  }),
});
export const publishInput = z
  .object({
    product_id: id,
    application_key: z.string().min(1).max(80),
    deliverables: z.array(z.string().trim().min(1).max(160)).min(1).max(20),
  })
  .strict();
export const bindInput = z.object({ offering_id: id, order_id: id }).strict();
export const boundPurchase = z.object({ organization_id: id, purchase_id: id });
export const provisioningStatus = z.enum([
  "awaiting_settlement",
  "queued",
  "waiting_service",
  "waiting_installation",
  "completed",
  "revoked",
  "failed",
]);
export const purchase = z.object({
  id,
  offering_id: id,
  order_id: id,
  quoted_total: z.number().int().positive(),
  currency: z.string().length(3),
  status: provisioningStatus,
});
export type SolutionPurchase = z.infer<typeof purchase>;
export const purchaseList = z.object({
  data: z.array(purchase),
  meta: z.object({
    organization_id: id,
    current_page: page,
    last_page: page,
    total: z.number().int().nonnegative(),
    per_page: page,
    options: z.object({ status: labels }),
  }),
});
export const purchaseStatus = z.object({
  organization_id: id,
  purchase_id: id,
  status: provisioningStatus,
  attempts: z.number().int().nonnegative(),
  options: z.object({ status: labels }),
});
export const retryResult = z.object({
  organization_id: id,
  purchase_id: id,
  status: provisioningStatus,
});
