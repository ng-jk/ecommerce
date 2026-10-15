import type { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../packages/api-client";
import { createInsightsClient } from "../../packages/api-client/services/insights";
import {
  parseColumns,
  parseCsv,
  insightsPath,
  insightsError,
} from "../../frontend/admin/src/screens/platform_insights_screen/logic/model";

const resource = {
  id: 4,
  name: "Team totals",
  visibility: "private",
  status: "active",
  version: 2,
};
const definition = {
  metric: { aggregate: "sum" as const, column: "value" },
  group_by: "team",
};
const output = {
  data: [{ group: "A", value: { numerator: 7, denominator: 2 } }],
  freshness: {
    dataset_id: 4,
    dataset_version: 2,
    imported_at: null,
    source_kind: "manual",
  },
  meta: { rows_scanned: 2, groups_total: 1, truncated: false },
};
describe("Insights SDK and typed manual import", () => {
  it("routes all sixteen commands and validates exact rational results", async () => {
    const request = vi.fn(
      async <T>(
        path: string,
        schema: z.ZodType<T, z.ZodTypeDef, unknown>,
        _method?: string,
        _body?: unknown,
      ) =>
        schema.parse(
          path.includes("?page=")
            ? {
                data: [resource],
                meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
              }
            : path.endsWith("/query") || path.endsWith("/run")
              ? output
              : path.endsWith("/render")
                ? { dashboard_id: 5, dashboard_version: 1, reports: [output] }
                : { resource },
        ),
    );
    const client = createInsightsClient(async (path, schema, method, body) =>
      schema.parse(
        await (method === undefined
          ? request(path, schema)
          : request(path, schema, method, body)),
      ),
    );
    for (const kind of ["datasets", "reports", "dashboards"] as const) {
      await client.list(3, kind);
      await client.detail(3, kind, 4);
    }
    await client.createDataset(3, {
      name: "X",
      visibility: "private",
      schema: [{ name: "value", type: "integer" }],
    });
    const mutation = {
      name: "X",
      visibility: "private" as const,
      expected_version: 2,
      status: "active" as const,
    };
    await client.updateDataset(3, 4, mutation);
    await client.replaceRows(3, 4, {
      expected_version: 2,
      rows: [{ value: 7 }],
    });
    expect((await client.query(3, 4, definition)).data[0]?.value).toEqual({
      numerator: 7,
      denominator: 2,
    });
    await client.createReport(3, {
      name: "X",
      visibility: "private",
      dataset_id: 4,
      definition,
    });
    await client.updateReport(3, 4, { ...mutation, definition });
    await client.runReport(3, 4);
    await client.createDashboard(3, {
      name: "X",
      visibility: "private",
      report_ids: [4],
    });
    await client.updateDashboard(3, 4, { ...mutation, report_ids: [4] });
    await client.renderDashboard(3, 4);
    expect(request).toHaveBeenCalledTimes(16);
    expect(request).toHaveBeenCalledWith(
      "organizations/3/insights/datasets/4/query",
      expect.anything(),
      "POST",
      { definition },
    );
    expect(() =>
      client.query(3, 4, {
        metric: { aggregate: "sum", column: "value" },
        limit: 51,
      }),
    ).toThrow();
    expect(() => client.detail("../other", "datasets", 4)).toThrow();
    expect(() =>
      client.replaceRows(3, 4, { expected_version: -1, rows: [] }),
    ).toThrow();
    expect(() =>
      client.replaceRows(3, 4, {
        expected_version: 2,
        rows: [{ value: Number.NaN }],
      }),
    ).toThrow();
    expect(request).toHaveBeenCalledTimes(16);
  });
  it("parses CSV quoting and strict schema types without coercing invalid rows", () => {
    const schema = parseColumns("team:string\nvalue:integer\nready:boolean");
    expect(
      parseCsv('team,value,ready\r\n"A,""B""",-7,true\r\nC,0,false\n', schema),
    ).toEqual([
      { team: 'A,"B"', value: -7, ready: true },
      { team: "C", value: 0, ready: false },
    ]);
    expect(
      parseCsv('team,value,ready\n"line\nbreak",1,true', schema)[0]?.team,
    ).toBe("line\nbreak");
    for (const text of [
      "bad-name:string",
      "x:float",
      "x:string:",
      "x:string\nx:integer",
      "",
      "x",
    ])
      expect(() => parseColumns(text)).toThrow();
    for (const text of [
      'team,value,ready\n"unfinished',
      'team,value,ready\n"X"bad,1,true',
      "wrong,value,ready\nX,1,true",
      "team,value,ready\nX,1",
      "team,value,ready\nX,01,true",
      "team,value,ready\nX,1000000001,true",
      "team,value,ready\nX,1,yes",
      `team,value,ready\n${"x".repeat(81)},1,true`,
    ])
      expect(() => parseCsv(text, schema)).toThrow();
    expect(() =>
      parseCsv("team,value,ready\n" + "X,1,true\n".repeat(501), schema),
    ).toThrow();
    expect(
      insightsError(
        new ApiError("Invalid", 422, "validation", { name: ["Required"] }),
      ),
    ).toContain("name: Required");
    expect(insightsError(null)).toContain("could not complete");
    expect(insightsPath("3")).toBe("/platform/organizations/3/insights");
    expect(insightsPath("3", "reports")).toBe(
      "/platform/organizations/3/insights/reports",
    );
  });
});
