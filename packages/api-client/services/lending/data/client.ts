import type { z } from "zod";
import {
  lendingId,
  lendingPage,
  productsList,
  productDetail,
  applicationsList,
  applicationDetail,
  schedule,
  createProduct,
  updateProduct,
  createApplication,
  updateApplication,
  expectedVersion,
  decideReview,
} from "../logic/contracts";

type Request = <T>(
  path: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  method?: string,
  body?: unknown,
) => Promise<T>;

export function createLendingClient(request: Request) {
  const base = (organizationId: string | number) =>
    `organizations/${lendingId.parse(organizationId)}/lending`;
  const collection = (organizationId: string | number, kind: string) =>
    `${base(organizationId)}/${kind}`;
  const record = (
    organizationId: string | number,
    kind: string,
    id: string | number,
  ) => `${collection(organizationId, kind)}/${lendingId.parse(id)}`;
  const listing = (
    organizationId: string | number,
    kind: string,
    page: number,
    status: string,
    perPage: number,
  ) =>
    `${collection(organizationId, kind)}?page=${lendingPage.parse(page)}&per_page=${lendingPage.max(50).parse(perPage)}` +
    (status ? `&status=${encodeURIComponent(status)}` : "");
  return {
    products: (
      organizationId: string | number,
      page = 1,
      status = "",
      perPage = 20,
    ) =>
      request(
        listing(organizationId, "products", page, status, perPage),
        productsList,
      ),
    product: (organizationId: string | number, id: string | number) =>
      request(record(organizationId, "products", id), productDetail),
    createProduct: (
      organizationId: string | number,
      input: z.input<typeof createProduct>,
    ) =>
      request(
        collection(organizationId, "products"),
        productDetail,
        "POST",
        createProduct.parse(input),
      ),
    updateProduct: (
      organizationId: string | number,
      id: string | number,
      input: z.input<typeof updateProduct>,
    ) =>
      request(
        record(organizationId, "products", id),
        productDetail,
        "PATCH",
        updateProduct.parse(input),
      ),
    applications: (
      organizationId: string | number,
      page = 1,
      status = "",
      perPage = 20,
    ) =>
      request(
        listing(organizationId, "applications", page, status, perPage),
        applicationsList,
      ),
    application: (organizationId: string | number, id: string | number) =>
      request(record(organizationId, "applications", id), applicationDetail),
    createApplication: (
      organizationId: string | number,
      input: z.input<typeof createApplication>,
    ) =>
      request(
        collection(organizationId, "applications"),
        applicationDetail,
        "POST",
        createApplication.parse(input),
      ),
    updateApplication: (
      organizationId: string | number,
      id: string | number,
      input: z.input<typeof updateApplication>,
    ) =>
      request(
        record(organizationId, "applications", id),
        applicationDetail,
        "PATCH",
        updateApplication.parse(input),
      ),
    submitApplication: (
      organizationId: string | number,
      id: string | number,
      input: z.input<typeof expectedVersion>,
    ) =>
      request(
        `${record(organizationId, "applications", id)}/submit`,
        applicationDetail,
        "POST",
        expectedVersion.parse(input),
      ),
    withdrawApplication: (
      organizationId: string | number,
      id: string | number,
      input: z.input<typeof expectedVersion>,
    ) =>
      request(
        `${record(organizationId, "applications", id)}/withdraw`,
        applicationDetail,
        "POST",
        expectedVersion.parse(input),
      ),
    schedule: (organizationId: string | number, id: string | number) =>
      request(
        `${record(organizationId, "applications", id)}/schedule`,
        schedule,
      ),
    reviews: (
      organizationId: string | number,
      page = 1,
      status = "",
      perPage = 20,
    ) =>
      request(
        listing(organizationId, "reviews", page, status, perPage),
        applicationsList,
      ),
    review: (organizationId: string | number, id: string | number) =>
      request(record(organizationId, "reviews", id), applicationDetail),
    decideReview: (
      organizationId: string | number,
      id: string | number,
      input: z.input<typeof decideReview>,
    ) =>
      request(
        `${record(organizationId, "reviews", id)}/decide`,
        applicationDetail,
        "POST",
        decideReview.parse(input),
      ),
  };
}
