import type { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { createLendingClient } from "../../packages/api-client/services/lending";
import { applicationDetail } from "../../packages/api-client/services/lending/logic/contracts";

const product = {
  id: 2,
  code: "basic",
  name: "Basic",
  jurisdiction_label: "Local terms",
  terms_text: "Whole-term flat charge",
  currency: "USD",
  minor_unit_digits: 2,
  principal_min_minor: 100,
  principal_max_minor: 1000,
  term_rate_numerator: 1,
  term_rate_denominator: 10,
  installment_count: 2,
  interval_days: 30,
  status: "active",
  version: 0,
};
const application = {
  id: 3,
  applicant_platform_user_id: 9,
  product_id: 2,
  principal_minor: 200,
  first_due_date: "2026-11-01",
  purpose: "Inventory",
  status: "draft",
  version: 0,
};
const productOptions = {
  draft: "Draft",
  active: "Active",
  disabled: "Disabled",
};
const applicationOptions = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};
const meta = { current_page: 1, per_page: 20, last_page: 1, total: 1 };
const productInput = (({ id, status, version, ...fields }) => fields)(product);

describe("standalone Lending SDK", () => {
  it("validates the complete frozen terms returned for a submitted application", () => {
    const terms_snapshot = {
      product_id: 2,
      product_version: 1,
      principal_minor: 200,
      first_due_date: "2026-11-01",
      jurisdiction_label: "Local",
      currency: "USD",
      minor_unit_digits: 2,
      terms_text: "Original whole-term terms",
      term_rate_numerator: 1,
      term_rate_denominator: 10,
      installment_count: 2,
      interval_days: 30,
    };
    const parsed = applicationDetail.parse({
      application: { ...application, status: "submitted", terms_snapshot },
      options: applicationOptions,
    });
    expect(parsed.application.terms_snapshot).toEqual(terms_snapshot);
    expect(() =>
      applicationDetail.parse({
        application: {
          ...application,
          status: "submitted",
          terms_snapshot: { ...terms_snapshot, term_rate_denominator: 0 },
        },
        options: applicationOptions,
      }),
    ).toThrow();
  });
  it("routes all 14 commands and validates completed results", async () => {
    const request = vi.fn(
      async <T>(
        path: string,
        schema: z.ZodType<T, z.ZodTypeDef, unknown>,
        _method?: string,
        _body?: unknown,
      ) => {
        const result = path.endsWith("/schedule")
          ? {
              application_id: 3,
              application_version: 1,
              currency: "USD",
              minor_unit_digits: 2,
              principal_minor: 200,
              charge_minor: 20,
              total_minor: 220,
              installments: [
                {
                  number: 1,
                  due_date: "2026-11-01",
                  principal_minor: 100,
                  charge_minor: 10,
                  total_minor: 110,
                },
              ],
            }
          : path.includes("/products?")
            ? { data: [product], meta: { ...meta, options: productOptions } }
            : path.includes("/applications?") || path.includes("/reviews?")
              ? {
                  data: [application],
                  meta: { ...meta, options: applicationOptions },
                }
              : path.includes("/products")
                ? { product, options: productOptions }
                : { application, options: applicationOptions };
        return schema.parse(result);
      },
    );
    const api = createLendingClient(async (path, schema, method, body) =>
      schema.parse(
        await (method === undefined
          ? request(path, schema)
          : request(path, schema, method, body)),
      ),
    );
    await api.products(1);
    await api.product(1, 2);
    await api.createProduct(1, productInput);
    const { code: _code, ...editableProduct } = productInput;
    await api.updateProduct(1, 2, {
      ...editableProduct,
      expected_version: 0,
      status: "active",
    });
    await api.applications(1);
    await api.application(1, 3);
    await api.createApplication(1, {
      product_id: 2,
      principal_minor: 200,
      first_due_date: "2026-11-01",
      purpose: "Inventory",
    });
    await api.updateApplication(1, 3, {
      principal_minor: 200,
      first_due_date: "2026-11-01",
      purpose: "Inventory",
      expected_version: 0,
    });
    await api.submitApplication(1, 3, { expected_version: 0 });
    await api.withdrawApplication(1, 3, { expected_version: 0 });
    expect((await api.schedule(1, 3)).installments[0]?.total_minor).toBe(110);
    await api.reviews(1);
    await api.review(1, 3);
    await api.decideReview(1, 3, {
      expected_version: 0,
      decision: "approved",
      decision_note: "Reviewed",
    });
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      "organizations/1/lending/products?page=1&per_page=20",
      "organizations/1/lending/products/2",
      "organizations/1/lending/products",
      "organizations/1/lending/products/2",
      "organizations/1/lending/applications?page=1&per_page=20",
      "organizations/1/lending/applications/3",
      "organizations/1/lending/applications",
      "organizations/1/lending/applications/3",
      "organizations/1/lending/applications/3/submit",
      "organizations/1/lending/applications/3/withdraw",
      "organizations/1/lending/applications/3/schedule",
      "organizations/1/lending/reviews?page=1&per_page=20",
      "organizations/1/lending/reviews/3",
      "organizations/1/lending/reviews/3/decide",
    ]);
    await api.products(1, 2, "active", 3);
    expect(request.mock.calls.at(-1)?.[0]).toContain("status=active");
  });

  it("rejects invalid identifiers, versions, terms, dates, and decisions before transport", () => {
    const request = vi.fn(
      async <T>(
        _path: string,
        schema: z.ZodType<T, z.ZodTypeDef, unknown>,
        _method?: string,
        _body?: unknown,
      ): Promise<T> => schema.parse({}),
    );
    const api = createLendingClient(async (path, schema, method, body) =>
      schema.parse(
        await (method === undefined
          ? request(path, schema)
          : request(path, schema, method, body)),
      ),
    );
    expect(() => api.product("bad", 2)).toThrow();
    expect(() => api.application(1, "bad")).toThrow();
    expect(() => api.products(1, 0)).toThrow();
    expect(() =>
      api.createProduct(1, { ...productInput, term_rate_numerator: 11 }),
    ).toThrow();
    expect(() =>
      api.createProduct(1, {
        ...productInput,
        installment_count: 120,
        interval_days: 365,
      }),
    ).toThrow();
    expect(() =>
      api.createApplication(1, {
        product_id: 2,
        principal_minor: 200,
        first_due_date: "2026-02-30",
        purpose: "Inventory",
      }),
    ).toThrow();
    expect(() =>
      api.submitApplication(1, 3, { expected_version: -1 }),
    ).toThrow();
    expect(() =>
      api.decideReview(1, 3, {
        expected_version: 0,
        decision: "approved",
        decision_note: "",
      }),
    ).toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});
