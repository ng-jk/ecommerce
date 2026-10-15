import type { z } from "zod";
import { expect, it, vi } from "vitest";
import { createCrmClient } from "../../packages/api-client/services/crm";

const request = vi.fn(
  async <T>(
    path: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    method?: string,
    body?: unknown,
  ) =>
    schema.parse(
      method === "POST" && path.endsWith("/convert")
        ? {
            lead: {
              id: 5,
              company_id: null,
              contact_id: 8,
              name: "A",
              email: "a@example.com",
              status: "converted",
              version: 2,
            },
            contact: {
              id: 8,
              company_id: null,
              name: "A",
              email: "a@example.com",
              version: 0,
            },
            options: { status: { converted: "Converted" } },
          }
        : method === "POST" || method === "PATCH"
          ? path.includes("/companies")
            ? { company: { id: 4, code: "acme", name: "Acme", version: 0 } }
            : path.includes("/contacts")
              ? {
                  contact: {
                    id: 3,
                    company_id: null,
                    name: "A",
                    email: "a@example.com",
                    version: 0,
                  },
                }
              : {
                  lead: {
                    id: 5,
                    company_id: null,
                    contact_id: null,
                    name: "A",
                    email: "a@example.com",
                    status: "new",
                    version: 0,
                  },
                  options: { status: { new: "New" } },
                }
          : path.includes("/companies")
            ? path.includes("?")
              ? {
                  data: [],
                  meta: {
                    current_page: 1,
                    last_page: 1,
                    total: 0,
                    per_page: 20,
                  },
                }
              : { company: { id: 4, code: "acme", name: "Acme", version: 0 } }
            : path.includes("/contacts")
              ? path.includes("?")
                ? {
                    data: [],
                    meta: {
                      current_page: 1,
                      last_page: 1,
                      total: 0,
                      per_page: 20,
                    },
                  }
                : {
                    contact: {
                      id: 3,
                      company_id: null,
                      name: "A",
                      email: "a@example.com",
                      version: 0,
                    },
                  }
              : path.includes("?")
                ? {
                    data: [],
                    meta: {
                      current_page: 1,
                      last_page: 1,
                      total: 0,
                      per_page: 20,
                      options: { status: { new: "New" } },
                    },
                  }
                : {
                    lead: {
                      id: 5,
                      company_id: null,
                      contact_id: null,
                      name: "A",
                      email: "a@example.com",
                      status: "new",
                      version: 0,
                    },
                    options: { status: { new: "New" } },
                  },
    ),
);

it("routes all CRM directories, details, versioned writes, and conversion through one platform transport", async () => {
  const crm = createCrmClient(async (path, schema, method, body) =>
    schema.parse(
      await (method === undefined
        ? request(path, schema)
        : request(path, schema, method, body)),
    ),
  );
  await crm.companies(7, 2, " ACME ");
  expect(request).toHaveBeenLastCalledWith(
    "organizations/7/crm/companies?page=2&code=ACME",
    expect.anything(),
  );
  await crm.companies(7);
  expect(request).toHaveBeenLastCalledWith(
    "organizations/7/crm/companies?page=1",
    expect.anything(),
  );
  await crm.contacts(7, 1, "4");
  expect(request).toHaveBeenLastCalledWith(
    "organizations/7/crm/contacts?page=1&company_id=4",
    expect.anything(),
  );
  await crm.contacts(7);
  await crm.leads(7, 1, "qualified", "4");
  expect(request).toHaveBeenLastCalledWith(
    "organizations/7/crm/leads?page=1&status=qualified&company_id=4",
    expect.anything(),
  );
  await crm.company(7, 4);
  await crm.contact(7, 3);
  await crm.lead(7, 5);
  await crm.createCompany(7, { code: "acme", name: "Acme" });
  await crm.updateCompany(7, 4, { name: "Acme", expected_version: 0 });
  await crm.createContact(7, {
    name: "A",
    email: "a@example.com",
    company_id: null,
  });
  await crm.updateContact(7, 3, {
    name: "A",
    email: "a@example.com",
    company_id: null,
    expected_version: 0,
  });
  await crm.createLead(7, {
    name: "A",
    email: "a@example.com",
    company_id: null,
  });
  await crm.updateLead(7, 5, {
    name: "A",
    email: "a@example.com",
    company_id: null,
    status: "contacted",
    expected_version: 0,
  });
  const converted = await crm.convertLead(7, 5, { expected_version: 1 });
  expect(converted.lead.status).toBe("converted");
  expect(request).toHaveBeenLastCalledWith(
    "organizations/7/crm/leads/5/convert",
    expect.anything(),
    "POST",
    { expected_version: 1 },
  );
  expect(request).toHaveBeenCalledTimes(15);
});

it("rejects malformed IDs and client-supplied fields before transport", () => {
  const crm = createCrmClient(async (path, schema, method, body) =>
    schema.parse(
      await (method === undefined
        ? request(path, schema)
        : request(path, schema, method, body)),
    ),
  );
  expect(() => crm.company("other", 1)).toThrow();
  expect(() => crm.contacts(1, 0)).toThrow();
  expect(() => crm.leads(1, 1, "", "other")).toThrow();
  expect(() =>
    crm.createLead(1, { name: "A", email: "bad", company_id: null }),
  ).toThrow();
  expect(() =>
    crm.updateCompany(1, 1, { name: "A", expected_version: -1 }),
  ).toThrow();
});
