import type { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import {
  createPlatformSolutions,
  createShopSolutions,
} from "../../packages/api-client/services/solutions";

const offering = {
  id: 4,
  product_id: 8,
  application_key: "crm",
  version: 1,
  unit_amount: 1000,
  currency: "MYR",
  deliverables: ["CRM access"],
  published_at: "2026-10-15T00:00:00Z",
};
const purchase = {
  id: 9,
  offering_id: 4,
  order_id: 12,
  quoted_total: 1800,
  currency: "MYR",
  status: "queued",
};
const meta = { current_page: 1, last_page: 1, total: 1, per_page: 20 };
const options = { queued: "Queued" };

describe("solution commerce clients", () => {
  it("validates and routes every shop and standalone command", async () => {
    const request = vi.fn(
      async <T>(
        path: string,
        schema: z.ZodType<T, z.ZodTypeDef, unknown>,
        _method?: string,
        _body?: unknown,
      ) => {
        const value = path.includes("offerings")
          ? path.endsWith("/4")
            ? { offering }
            : path.includes("admin/")
              ? {
                  offering: {
                    id: 4,
                    version: 1,
                    application_key: "crm",
                    unit_amount: 1000,
                    currency: "MYR",
                  },
                }
              : { data: [offering], meta }
          : path.endsWith("/retry")
            ? { organization_id: 2, purchase_id: 9, status: "queued" }
            : path.endsWith("/detail?purchase_id=9")
              ? {
                  organization_id: 2,
                  purchase_id: 9,
                  status: "queued",
                  attempts: 0,
                  options: { status: options },
                }
              : path.includes("?")
                ? {
                    data: [purchase],
                    meta: {
                      ...meta,
                      organization_id: 2,
                      options: { status: options },
                    },
                  }
                : path.startsWith("platform/")
                  ? { organization_id: 2, purchase_id: 9 }
                  : {
                      data: [purchase],
                      meta: {
                        ...meta,
                        organization_id: 2,
                        options: { status: options },
                      },
                    };
        return schema.parse(value);
      },
    );
    const shop = createShopSolutions(async (path, schema, method, body) =>
      schema.parse(
        await (method === undefined
          ? request(path, schema)
          : request(path, schema, method, body)),
      ),
    );
    const platform = createPlatformSolutions(
      async (path, schema, method, body) =>
        schema.parse(
          await (method === undefined
            ? request(path, schema)
            : request(path, schema, method, body)),
        ),
    );
    expect((await shop.offerings()).data[0]?.id).toBe(4);
    expect((await shop.offering(4)).offering.product_id).toBe(8);
    expect(
      (
        await shop.publish({
          product_id: 8,
          application_key: "crm",
          deliverables: ["CRM access"],
        })
      ).offering.id,
    ).toBe(4);
    expect(
      (await shop.bind(2, { offering_id: 4, order_id: 12 })).purchase_id,
    ).toBe(9);
    expect((await shop.purchases(2)).data[0]?.id).toBe(9);
    expect((await shop.purchase(2, 9)).status).toBe("queued");
    expect((await shop.retry(2, 9)).status).toBe("queued");
    expect((await platform.purchases(2)).data[0]?.id).toBe(9);
    expect((await platform.purchase(2, 9)).status).toBe("queued");
    expect((await platform.retry(2, 9)).status).toBe("queued");
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      "solutions/offerings?page=1",
      "solutions/offerings/4",
      "admin/solutions/offerings",
      "platform/organizations/2/solution-purchases",
      "platform/organizations/2/solution-purchases?page=1",
      "platform/organizations/2/solution-purchases/detail?purchase_id=9",
      "platform/organizations/2/solution-purchases/retry",
      "organizations/2/solution-purchases?page=1",
      "organizations/2/solution-purchases/detail?purchase_id=9",
      "organizations/2/solution-purchases/retry",
    ]);
    await shop.offerings(2, "crm");
    expect(request.mock.calls.at(-1)?.[0]).toBe(
      "solutions/offerings?page=2&application_key=crm",
    );
  });

  it("rejects invalid ids and offering content before transport", () => {
    const request = vi.fn(
      async <T>(
        _path: string,
        schema: z.ZodType<T, z.ZodTypeDef, unknown>,
        _method?: string,
        _body?: unknown,
      ): Promise<T> => schema.parse({}),
    );
    const shop = createShopSolutions(async (path, schema, method, body) =>
      schema.parse(
        await (method === undefined
          ? request(path, schema)
          : request(path, schema, method, body)),
      ),
    );
    const platform = createPlatformSolutions(
      async (path, schema, method, body) =>
        schema.parse(
          await (method === undefined
            ? request(path, schema)
            : request(path, schema, method, body)),
        ),
    );
    expect(() => shop.offering("bad")).toThrow();
    expect(() => shop.offerings(0)).toThrow();
    expect(() =>
      shop.publish({
        product_id: -1,
        application_key: "crm",
        deliverables: ["CRM"],
      }),
    ).toThrow();
    expect(() => shop.bind(0, { offering_id: 1, order_id: 2 })).toThrow();
    expect(() => platform.purchase(1, "bad")).toThrow();
    expect(() => platform.retry(1, 0)).toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});
