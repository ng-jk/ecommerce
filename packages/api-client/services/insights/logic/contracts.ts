import { z } from "zod";
const id = z.number().int().positive();
const version = z.number().int().nonnegative();
export const insightsId = z.coerce.number().int().positive();
export const kind = z.enum(["datasets", "reports", "dashboards"]);
export type InsightsKind = z.infer<typeof kind>;
export const visibility = z.enum(["private", "organization"]);
export const column = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
    type: z.enum(["string", "integer", "boolean"]),
  })
  .strict();
export type InsightColumn = z.infer<typeof column>;
export const cell = z.union([
  z.string().max(80),
  z.number().int().min(-1000000000).max(1000000000),
  z.boolean(),
]);
export const definition = z
  .object({
    metric: z
      .object({
        aggregate: z.enum(["count", "sum", "avg"]),
        column: z.string().max(40).optional(),
      })
      .strict(),
    group_by: z.string().max(40).optional(),
    limit: z.number().int().min(1).max(50).optional(),
    filters: z
      .array(
        z
          .object({
            column: z.string().max(40),
            operator: z.enum(["eq", "gte", "lte"]),
            value: cell,
          })
          .strict(),
      )
      .max(5)
      .optional(),
  })
  .strict();
export type InsightDefinition = z.infer<typeof definition>;
export const resource = z.object({
  id,
  name: z.string(),
  status: z.enum(["active", "disabled"]),
  visibility,
  version,
  schema: z.array(column).optional(),
  source_kind: z.literal("manual").optional(),
  imported_at: z.string().nullable().optional(),
  dataset_id: id.optional(),
  definition: definition.optional(),
  report_ids: z.array(id).optional(),
});
export type InsightResource = z.infer<typeof resource>;
export const resourceResult = z.object({
  resource,
  options: z.record(z.string()).optional(),
  row_count: version.optional(),
});
export const listing = z.object({
  data: z.array(resource),
  meta: z.object({
    current_page: id,
    last_page: id,
    total: version,
    per_page: id,
  }),
});
export const queryResult = z.object({
  data: z.array(
    z.object({
      group: cell.nullable(),
      value: z.union([
        z.number().int(),
        z.object({ numerator: z.number().int(), denominator: id }),
      ]),
    }),
  ),
  freshness: z.object({
    dataset_id: id,
    dataset_version: version,
    imported_at: z.string().nullable(),
    source_kind: z.literal("manual"),
  }),
  meta: z.object({
    groups_total: version,
    truncated: z.boolean(),
    rows_scanned: version,
  }),
  report_id: id.optional(),
  report_version: version.optional(),
});
export type InsightQueryResult = z.infer<typeof queryResult>;
export const dashboardResult = z.object({
  dashboard_id: id,
  dashboard_version: version,
  reports: z.array(queryResult),
});
const common = z
  .object({ name: z.string().min(1).max(200), visibility })
  .strict();
export const createDataset = common
  .extend({ schema: z.array(column).min(1).max(20) })
  .strict();
export const createReport = common
  .extend({ dataset_id: id, definition })
  .strict();
export const createDashboard = common
  .extend({ report_ids: z.array(id).min(1).max(6) })
  .strict();
const mutation = common
  .extend({ expected_version: version, status: z.enum(["active", "disabled"]) })
  .strict();
export const updateDataset = mutation;
export const updateReport = mutation.extend({ definition }).strict();
export const updateDashboard = mutation
  .extend({ report_ids: z.array(id).min(1).max(6) })
  .strict();
export const replaceRows = z
  .object({ expected_version: version, rows: z.array(z.record(cell)).max(500) })
  .strict();
