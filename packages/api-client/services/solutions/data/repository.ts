import { z, type ZodType } from "zod";
import {
  bindInput,
  boundPurchase,
  offeringDetail,
  offeringList,
  publishedOffering,
  publishInput,
  purchaseList,
  purchaseStatus,
  retryResult,
} from "../logic/contracts";

type Request = <T>(
  path: string,
  schema: ZodType<T, z.ZodTypeDef, unknown>,
  method?: string,
  body?: unknown,
) => Promise<T>;

const positiveId = z.coerce.number().int().positive();
const positivePage = z.number().int().min(1).max(1000000);

function purchases(request: Request, prefix: string) {
  const base = (organizationId: string | number) =>
    `${prefix}/${positiveId.parse(organizationId)}/solution-purchases`;
  return {
    purchases: (organizationId: string | number, page = 1) =>
      request(
        `${base(organizationId)}?page=${positivePage.parse(page)}`,
        purchaseList,
      ),
    purchase: (organizationId: string | number, purchaseId: string | number) =>
      request(
        `${base(organizationId)}/detail?purchase_id=${positiveId.parse(purchaseId)}`,
        purchaseStatus,
      ),
    retry: (organizationId: string | number, purchaseId: string | number) =>
      request(`${base(organizationId)}/retry`, retryResult, "POST", {
        purchase_id: positiveId.parse(purchaseId),
      }),
  };
}

export function createPlatformSolutions(request: Request) {
  return purchases(request, "organizations");
}

export function createShopSolutions(request: Request) {
  return {
    ...purchases(request, "platform/organizations"),
    offerings: (page = 1, applicationKey = "") =>
      request(
        `solutions/offerings?page=${positivePage.parse(page)}${applicationKey ? `&application_key=${encodeURIComponent(z.string().min(1).max(80).parse(applicationKey))}` : ""}`,
        offeringList,
      ),
    offering: (offeringId: string | number) =>
      request(
        `solutions/offerings/${positiveId.parse(offeringId)}`,
        offeringDetail,
      ),
    publish: (input: z.input<typeof publishInput>) =>
      request(
        "admin/solutions/offerings",
        publishedOffering,
        "POST",
        publishInput.parse(input),
      ),
    bind: (organizationId: string | number, input: z.input<typeof bindInput>) =>
      request(
        `${"platform/organizations"}/${positiveId.parse(organizationId)}/solution-purchases`,
        boundPurchase,
        "POST",
        bindInput.parse(input),
      ),
  };
}
