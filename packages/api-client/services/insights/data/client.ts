import { z } from "zod";
import * as schema from "../logic/contracts";
type Request = <T>(
  path: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  method?: string,
  body?: unknown,
) => Promise<T>;
export function createInsightsClient(request: Request) {
  const base = (org: string | number) =>
    `organizations/${schema.insightsId.parse(org)}/insights`;
  const path = (
    org: string | number,
    kind: schema.InsightsKind,
    id: string | number,
  ) => `${base(org)}/${schema.kind.parse(kind)}/${schema.insightsId.parse(id)}`;
  return {
    list: (
      org: string | number,
      kind: schema.InsightsKind,
      page = 1,
      perPage = 20,
    ) =>
      request(
        `${base(org)}/${schema.kind.parse(kind)}?page=${z.number().int().min(1).max(1000000).parse(page)}&per_page=${z.number().int().min(1).max(50).parse(perPage)}`,
        schema.listing,
      ),
    detail: (
      org: string | number,
      kind: schema.InsightsKind,
      id: string | number,
    ) => request(path(org, kind, id), schema.resourceResult),
    createDataset: (
      org: string | number,
      input: z.input<typeof schema.createDataset>,
    ) =>
      request(
        `${base(org)}/datasets`,
        schema.resourceResult,
        "POST",
        schema.createDataset.parse(input),
      ),
    updateDataset: (
      org: string | number,
      id: string | number,
      input: z.input<typeof schema.updateDataset>,
    ) =>
      request(
        path(org, "datasets", id),
        schema.resourceResult,
        "PUT",
        schema.updateDataset.parse(input),
      ),
    replaceRows: (
      org: string | number,
      id: string | number,
      input: z.input<typeof schema.replaceRows>,
    ) =>
      request(
        `${path(org, "datasets", id)}/rows`,
        schema.resourceResult,
        "POST",
        schema.replaceRows.parse(input),
      ),
    query: (
      org: string | number,
      id: string | number,
      input: schema.InsightDefinition,
    ) =>
      request(
        `${path(org, "datasets", id)}/query`,
        schema.queryResult,
        "POST",
        { definition: schema.definition.parse(input) },
      ),
    createReport: (
      org: string | number,
      input: z.input<typeof schema.createReport>,
    ) =>
      request(
        `${base(org)}/reports`,
        schema.resourceResult,
        "POST",
        schema.createReport.parse(input),
      ),
    updateReport: (
      org: string | number,
      id: string | number,
      input: z.input<typeof schema.updateReport>,
    ) =>
      request(
        path(org, "reports", id),
        schema.resourceResult,
        "PUT",
        schema.updateReport.parse(input),
      ),
    runReport: (org: string | number, id: string | number) =>
      request(
        `${path(org, "reports", id)}/run`,
        schema.queryResult,
        "POST",
        {},
      ),
    createDashboard: (
      org: string | number,
      input: z.input<typeof schema.createDashboard>,
    ) =>
      request(
        `${base(org)}/dashboards`,
        schema.resourceResult,
        "POST",
        schema.createDashboard.parse(input),
      ),
    updateDashboard: (
      org: string | number,
      id: string | number,
      input: z.input<typeof schema.updateDashboard>,
    ) =>
      request(
        path(org, "dashboards", id),
        schema.resourceResult,
        "PUT",
        schema.updateDashboard.parse(input),
      ),
    renderDashboard: (org: string | number, id: string | number) =>
      request(
        `${path(org, "dashboards", id)}/render`,
        schema.dashboardResult,
        "POST",
        {},
      ),
  };
}
