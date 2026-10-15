import type { z } from "zod";
import { expect, it, vi } from "vitest";
import { createCrmClient } from "../../packages/api-client/services/crm";

const pipeline = { id: 2, code: "sales", name: "Sales", version: 0 };
const stage = {
  id: 3,
  pipeline_id: 2,
  code: "intake",
  name: "Intake",
  position: 10,
  outcome: "open",
  version: 0,
};
const deal = {
  id: 4,
  pipeline_id: 2,
  stage_id: 3,
  company_id: null,
  contact_id: null,
  assignee_platform_user_id: null,
  title: "Renewal",
  amount_minor: 2500,
  currency: "USD",
  status: "open",
  version: 0,
};
const activity = {
  id: 5,
  deal_id: 4,
  type: "call",
  summary: "Called",
  occurred_at: "2026-10-13T10:00:00+00:00",
};
const records = {
  pipelines: { pipeline },
  stages: { stage, options: { outcome: { open: "Open" } } },
  deals: { deal, options: { status: { open: "Open" } } },
  activities: { activity, options: { type: { call: "Call" } } },
};
const page = { current_page: 1, last_page: 1, total: 1, per_page: 20 };
const request = vi.fn(
  async <T>(
    path: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    _method?: string,
    _body?: unknown,
  ) => {
    const kind = (Object.keys(records) as Array<keyof typeof records>).find(
      (value) => path.includes(`/${value}`),
    )!;
    const item = records[kind];
    const row =
      kind === "pipelines"
        ? pipeline
        : kind === "stages"
          ? stage
          : kind === "deals"
            ? deal
            : activity;
    return schema.parse(
      path.includes("?")
        ? {
            data: [row],
            meta: {
              ...page,
              ...("options" in item ? { options: item.options } : {}),
            },
          }
        : item,
    );
  },
);

it("routes every CRM growth collection, record, versioned write and advance through the shared transport", async () => {
  const crm = createCrmClient(async (path, schema, method, body) =>
    schema.parse(
      await (method === undefined
        ? request(path, schema)
        : request(path, schema, method, body)),
    ),
  );
  await crm.pipelines(7, 2, " SALE ");
  expect(request).toHaveBeenLastCalledWith(
    "organizations/7/crm/pipelines?page=2&code=SALE",
    expect.anything(),
  );
  await crm.pipelines(7);
  await crm.pipeline(7, 2);
  await crm.createPipeline(7, { code: "sales", name: "Sales" });
  await crm.updatePipeline(7, 2, { name: "Sales", expected_version: 0 });
  await crm.stages(7, 2, 1, "open");
  expect(request).toHaveBeenLastCalledWith(
    "organizations/7/crm/stages?pipeline_id=2&page=1&outcome=open",
    expect.anything(),
  );
  await crm.stages(7, 2);
  await crm.stage(7, 3);
  await crm.createStage(7, {
    pipeline_id: 2,
    code: "intake",
    name: "Intake",
    position: 10,
    outcome: "open",
  });
  await crm.updateStage(7, 3, { name: "New", expected_version: 0 });
  await crm.deals(7, 1, "2", "open");
  expect(request).toHaveBeenLastCalledWith(
    "organizations/7/crm/deals?page=1&pipeline_id=2&status=open",
    expect.anything(),
  );
  await crm.deals(7);
  await crm.deal(7, 4);
  const input = {
    pipeline_id: 2,
    stage_id: 3,
    title: "Renewal",
    company_id: null,
    contact_id: null,
    assignee_platform_user_id: null,
    amount_minor: 2500,
    currency: "USD",
  };
  await crm.createDeal(7, input);
  await crm.updateDeal(7, 4, {
    title: input.title,
    company_id: null,
    contact_id: null,
    assignee_platform_user_id: null,
    amount_minor: input.amount_minor,
    currency: input.currency,
    expected_version: 0,
  });
  await crm.advanceDeal(7, 4, { stage_id: 3, expected_version: 0 });
  expect(request).toHaveBeenLastCalledWith(
    "organizations/7/crm/deals/4/advance",
    expect.anything(),
    "POST",
    { stage_id: 3, expected_version: 0 },
  );
  await crm.activities(7, 1, "4", "call");
  expect(request).toHaveBeenLastCalledWith(
    "organizations/7/crm/activities?page=1&deal_id=4&type=call",
    expect.anything(),
  );
  await crm.activities(7);
  await crm.activity(7, 5);
  await crm.createActivity(7, {
    deal_id: 4,
    type: "call",
    summary: "Called",
    occurred_at: "2026-10-13T10:00:00+00:00",
  });
  expect(request).toHaveBeenCalledTimes(20);
});

it("rejects malformed IDs, unsafe amounts, unknown fields and malformed responses", async () => {
  const crm = createCrmClient(async (path, schema, method, body) =>
    schema.parse(
      await (method === undefined
        ? request(path, schema)
        : request(path, schema, method, body)),
    ),
  );
  expect(() => crm.stages(7, "bad")).toThrow();
  expect(() => crm.deals(7, 0)).toThrow();
  expect(() => crm.activities(7, 1, "bad")).toThrow();
  expect(() =>
    crm.createStage(7, {
      pipeline_id: 2,
      code: "bad",
      name: "Bad",
      position: 1001,
      outcome: "open",
    }),
  ).toThrow();
  expect(() =>
    crm.createDeal(7, {
      pipeline_id: 2,
      stage_id: 3,
      title: "Bad",
      company_id: null,
      contact_id: null,
      assignee_platform_user_id: null,
      amount_minor: 1.5,
      currency: "USD",
    }),
  ).toThrow();
  expect(() =>
    crm.updateDeal(7, 4, {
      title: "Bad",
      company_id: null,
      contact_id: null,
      assignee_platform_user_id: null,
      amount_minor: 100,
      currency: "usd",
      expected_version: 0,
    }),
  ).toThrow();
  request.mockImplementationOnce(async (_path, schema) =>
    schema.parse({
      deal: { ...deal, amount_minor: "unsafe" },
      options: { status: {} },
    }),
  );
  await expect(crm.deal(7, 4)).rejects.toThrow();
});
