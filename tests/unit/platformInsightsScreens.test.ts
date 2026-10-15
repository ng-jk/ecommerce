// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import type { InsightQueryResult, InsightResource } from "../../packages/api-client";


vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const routing = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), params: { id: "7", recordId: "4" } }));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return { router: routing, useLocalSearchParams: () => routing.params,
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]) };
});

const resource: InsightResource = { id: 4, name: "Manual", version: 2, visibility: "private", status: "active", schema: [{ name: "team", type: "string" }, { name: "value", type: "integer" }], report_ids: [5] };
const output: InsightQueryResult = { data: [{ group: "A", value: { numerator: 7, denominator: 2 } }], freshness: { dataset_id: 4, dataset_version: 2, imported_at: null, source_kind: "manual" }, meta: { rows_scanned: 2, groups_total: 1, truncated: false } };
const insights = { detail: vi.fn(async () => ({ resource })), list: vi.fn(async () => ({ data: [resource], meta: { current_page: 1, last_page: 2, per_page: 3, total: 4 } })), query: vi.fn(async () => output), createReport: vi.fn(async () => ({ resource })), updateReport: vi.fn(async () => ({ resource })), createDataset: vi.fn(async () => ({ resource })), updateDataset: vi.fn(async () => ({ resource })), replaceRows: vi.fn(async () => ({ resource })), createDashboard: vi.fn(async () => ({ resource })), updateDashboard: vi.fn(async () => ({ resource })), runReport: vi.fn(async () => output), renderDashboard: vi.fn(async () => ({ reports: [output] })) };
const session = { api: { insights }, user: { id: 9 } as { id: number } | null };
vi.mock("../../frontend/admin/src/screens/platform_shell_screen", () => ({
  usePlatformSession: () => session,
  PlatformPage: ({ title, children }: { title: string; children: ReactNode }) =>
    createElement("main", {}, createElement("h1", {}, title), children),
  PlatformText: ({ children }: { children: ReactNode }) => createElement("p", {}, children),
  PlatformButton: ({ title, onPress, disabled }: { title: string; onPress(): void; disabled?: boolean }) =>
    createElement("button", { onClick: onPress, disabled }, title),
  PlatformField: ({ label, value, onChangeText, multiline }: {
    label: string; value: string; multiline?: boolean; onChangeText(value: string): void;
  }) => createElement(multiline ? "textarea" : "input", { "aria-label": label, value,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChangeText(event.currentTarget.value) }),
}));

import { InsightsHub, InsightsDirectory, InsightsRecord, InsightsQuery, DatasetForm, DatasetImport, DashboardForm } from "../../frontend/admin/src/screens/platform_insights_screen";
import { QueryOutput } from "../../frontend/admin/src/screens/platform_insights_screen/interface/Pages";
beforeEach(() => { vi.clearAllMocks(); session.user = { id: 9 }; insights.detail.mockResolvedValue({ resource }); });
async function render(element: React.ReactElement) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => { root.render(element); });
  return {
    container,
    button(label: string) { return [...container.querySelectorAll("button")].find(item => item.textContent?.includes(label))!; },
    async press(label: string) { await act(async () => { this.button(label).click(); }); },
    async fill(label: string, value: string) {
      const input = container.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    },
    async close() { await act(async () => root.unmount()); },
  };
}

it("navigates bounded directories and runs fresh dashboard results", async () => {
 const hub = await render(createElement(InsightsHub)); await hub.press("datasets"); expect(routing.push).toHaveBeenCalledWith("/platform/organizations/7/insights/datasets"); await hub.close();
 const list = await render(createElement(InsightsDirectory, { kind: "datasets" })); await list.press("Next"); expect(insights.list).toHaveBeenLastCalledWith("7", "datasets", 2, 3); await list.press("Previous"); await list.press("Create dataset"); await list.press("Manual"); await list.close();
 const record = await render(createElement(InsightsRecord, { kind: "dashboards" })); await record.press("Run with current data"); expect(record.container.textContent).toContain("7 / 2"); await record.press("Disable dashboard"); expect(insights.updateDashboard).toHaveBeenCalledWith("7", "4", expect.objectContaining({ status: "disabled", expected_version: 2 })); await record.close();
});
it("builds a typed query and saves the same definition without arbitrary SQL", async () => {
 const view = await render(createElement(InsightsQuery)); await view.press("Back to record"); await view.fill("Maximum groups (1–50)", "49"); await view.fill("Maximum groups (1–50)", "50"); await view.press("Measure:"); await view.press("Group:"); await view.press("Choose filters");
 await view.press("Column:"); await view.fill("Filter value", "2"); await view.press("Add filter"); await view.press("Review query"); await view.press("Run query");
 const definition = { metric: { aggregate: "sum", column: "value" }, group_by: "team", limit: 50, filters: [{ column: "value", operator: "eq", value: 2 }] };
 expect(insights.query).toHaveBeenCalledWith("7", "4", definition); expect(view.container.textContent).toContain("7 / 2");
 await view.press("Save report"); await view.fill("Report name", "Totals"); await view.press("Save"); expect(insights.createReport).toHaveBeenCalledWith("7", { name: "Totals", visibility: "private", dataset_id: 4, definition }); await view.close();
});
it("creates schema, imports CSV with current version and selects dashboard reports", async () => {
 const form = await render(createElement(DatasetForm)); await form.fill("Name", "New"); await form.press("Save"); expect(insights.createDataset).toHaveBeenCalledWith("7", { name: "New", visibility: "private", schema: resource.schema }); await form.close();
 const importer = await render(createElement(DatasetImport)); await importer.fill("CSV including headers", "team,value\nA,7"); await importer.press("Replace rows"); expect(insights.replaceRows).toHaveBeenCalledWith("7", "4", { expected_version: 2, rows: [{ team: "A", value: 7 }] }); await importer.close();
 const dashboard = await render(createElement(DashboardForm)); await dashboard.press("Manual"); await dashboard.press("Continue"); await dashboard.fill("Name", "Board"); await dashboard.press("Save"); expect(insights.createDashboard).toHaveBeenCalledWith("7", { name: "Board", visibility: "private", report_ids: [4] }); await dashboard.close();
});
it("edits metadata with versions and exposes recoverable failures", async () => {
 const dataset = await render(createElement(DatasetForm, { edit: true })); await dataset.press("Visibility:"); await dataset.press("Status:"); await dataset.fill("Name", "Edited"); await dataset.press("Save"); expect(insights.updateDataset).toHaveBeenCalledWith("7", 4, { name: "Edited", visibility: "organization", status: "disabled", expected_version: 2 }); await dataset.close();
 const dashboard = await render(createElement(DashboardForm, { edit: true })); await dashboard.press("Next reports"); await dashboard.press("Previous reports"); await dashboard.press("Continue"); await dashboard.press("Visibility:"); await dashboard.press("Change reports"); await dashboard.press("Continue"); await dashboard.fill("Name", "Changed"); await dashboard.press("Save"); expect(insights.updateDashboard).toHaveBeenCalledWith("7", 4, expect.objectContaining({ name: "Changed", expected_version: 2 })); await dashboard.close();
 const details = await render(createElement(InsightsRecord, { kind: "datasets" })); await details.press("Edit"); await details.press("Replace dataset rows"); await details.press("Explore and save report"); await details.close();
 insights.detail.mockRejectedValueOnce(new Error("Offline")); const failed = await render(createElement(InsightsRecord, { kind: "reports" })); expect(failed.container.textContent).toContain("Offline"); await failed.press("Retry"); await failed.press("Run with current data"); await failed.close();
 session.user = null; const anonymous = await render(createElement(InsightsDirectory, { kind: "reports" })); await anonymous.press("Sign in"); await anonymous.close();
 session.user = { id: 9 }; insights.list.mockRejectedValueOnce(new Error("Unavailable")); const directory = await render(createElement(InsightsDirectory, { kind: "reports" })); await directory.press("Retry"); expect(directory.container.textContent).toContain("Open a dataset"); await directory.close();
});
it("edits saved report definitions, rejects invalid filters and retains editable errors", async () => {
 insights.detail.mockImplementation(async (_org?: unknown, kind?: unknown) => ({ resource: kind === "reports" ? { ...resource, dataset_id: 4, definition: { metric: { aggregate: "count" as const } } } : resource }));
 const view = await render(createElement(InsightsQuery, { edit: true })); await view.press("Choose filters"); await view.press("Previous step"); await view.press("Back to record"); await view.press("Measure:"); await view.press("Measure column:"); await view.press("Measure:"); await view.press("Choose filters"); await view.press("Column:"); await view.press("Comparison:"); await view.fill("Filter value", "bad"); await view.press("Add filter"); expect(view.container.textContent).toContain("Enter an integer"); await view.press("Clear filters"); await view.press("Review query"); await view.press("Save report"); await view.press("Visibility:"); await view.press("Status:"); await view.press("Save"); expect(insights.updateReport).toHaveBeenCalledWith("7", "4", expect.objectContaining({ expected_version: 2, status: "disabled", visibility: "organization" })); await view.close();
 insights.detail.mockRejectedValueOnce(new Error("Lost connection")); const failed = await render(createElement(InsightsQuery)); expect(failed.container.textContent).toContain("Lost connection"); await failed.press("Retry"); await failed.close();
 insights.createDataset.mockRejectedValueOnce(new Error("Conflict")); const form = await render(createElement(DatasetForm)); await form.fill("Name", "Keep me"); await form.press("Save"); expect(form.container.textContent).toContain("Conflict"); expect(form.container.querySelector<HTMLInputElement>('input[aria-label="Name"]')?.value).toBe("Keep me"); await form.close();
});
it("keeps defaults and supports reversing metadata selections and safe navigation", async () => {
 const hub = await render(createElement(InsightsHub)); await hub.press("Organization"); await hub.close();
 const list = await render(createElement(InsightsDirectory, { kind: "dashboards" })); await list.press("Create dashboard"); await list.press("Insights"); await list.close();
 insights.list.mockResolvedValueOnce({ data: [], meta: { current_page: 1, last_page: 1, per_page: 3, total: 0 } }); const empty = await render(createElement(InsightsDirectory, { kind: "datasets" })); expect(empty.container.textContent).toContain("No records"); await empty.close();
 const edit = await render(createElement(DatasetForm, { edit: true })); await edit.press("Save"); expect(insights.updateDataset).toHaveBeenLastCalledWith("7", 4, expect.objectContaining({ name: "Manual", status: "active" })); await edit.press("Visibility:"); await edit.press("Visibility:"); await edit.press("Status:"); await edit.press("Status:"); await edit.press("Datasets"); await edit.close();
 const create = await render(createElement(DatasetForm)); await create.press("Visibility:"); await create.press("Visibility:"); await create.press("Save"); expect(insights.createDataset).toHaveBeenLastCalledWith("7", expect.objectContaining({ name: "" })); await create.close();
 insights.detail.mockRejectedValueOnce(new Error("Cannot load")); const missing = await render(createElement(DatasetForm, { edit: true })); expect(missing.container.textContent).toContain("Cannot load"); await missing.close();
 insights.replaceRows.mockRejectedValueOnce(new Error("Import conflict")); const importer = await render(createElement(DatasetImport)); await importer.fill("CSV including headers", "team,value\nA,7"); await importer.press("Replace rows"); expect(importer.container.textContent).toContain("Import conflict"); await importer.press("Dataset"); await importer.close();
 const board = await render(createElement(DashboardForm)); await board.press("Manual"); await board.press("Manual"); await board.press("Manual"); await board.press("Continue"); await board.press("Visibility:"); await board.press("Visibility:"); await board.press("Save"); expect(insights.createDashboard).toHaveBeenLastCalledWith("7", expect.objectContaining({ name: "" })); await board.press("Dashboards"); await board.close();
 const editBoard = await render(createElement(DashboardForm, { edit: true })); await editBoard.press("Continue"); await editBoard.press("Save"); expect(insights.updateDashboard).toHaveBeenLastCalledWith("7", 4, expect.objectContaining({ name: "Manual" })); insights.updateDashboard.mockRejectedValueOnce(new Error("Stale board")); await editBoard.press("Save"); expect(editBoard.container.textContent).toContain("Stale board"); await editBoard.close();
});
it("renders empty and truncated numeric output and preserves failures without showing stale results", async () => {
 const numbers = await render(createElement(QueryOutput, { result: { ...output, data: [{ group: null, value: 12 }], meta: { ...output.meta, truncated: true } } })); expect(numbers.container.textContent).toContain("All rows: 12"); expect(numbers.container.textContent).toContain("bounded subset"); await numbers.close();
 const empty = await render(createElement(QueryOutput, { result: { ...output, data: [] } })); expect(empty.container.textContent).toContain("No matching rows"); await empty.close();
 insights.runReport.mockRejectedValueOnce(new Error("Access changed")); const report = await render(createElement(InsightsRecord, { kind: "reports" })); await report.press("Run with current data"); expect(report.container.textContent).toContain("Access changed"); expect(report.container.textContent).not.toContain("7 / 2"); await report.press("reports"); await report.close();
 insights.detail.mockResolvedValueOnce({ resource: { ...resource, status: "disabled" } }); insights.updateDashboard.mockRejectedValueOnce(new Error("Version changed")); const board = await render(createElement(InsightsRecord, { kind: "dashboards" })); await board.press("Enable dashboard"); expect(board.container.textContent).toContain("Version changed"); expect(insights.updateDashboard).toHaveBeenLastCalledWith("7", "4", expect.objectContaining({ status: "active" })); await board.close();
});
it("supports count, all groups, text and boolean filters with recoverable query and save rejection", async () => {
  insights.detail.mockResolvedValue({ resource: { ...resource, schema: [...(resource.schema ?? []), { name: "ready", type: "boolean" }] } });
 const view = await render(createElement(InsightsQuery)); await view.press("Measure:"); await view.press("Measure:"); await view.press("Measure:"); await view.fill("Maximum groups (1–50)", "no"); await view.press("Choose filters");
 await view.fill("Filter value", "A"); await view.press("Add filter"); await view.press("Column:"); await view.press("Comparison:"); await view.press("Comparison:"); await view.press("Comparison:"); await view.press("Column:"); await view.fill("Filter value", "yes"); await view.press("Add filter"); expect(view.container.textContent).toContain("Enter true or false"); await view.fill("Filter value", "true"); await view.press("Add filter"); await view.press("Review query");
 insights.query.mockRejectedValueOnce(new Error("Fresh access denied")); await view.press("Run query"); expect(view.container.textContent).toContain("Fresh access denied"); await view.press("Save report"); await view.press("Visibility:"); await view.press("Visibility:"); insights.createReport.mockRejectedValueOnce(new Error("Name required")); await view.press("Save"); expect(view.container.textContent).toContain("Name required"); expect(insights.createReport).toHaveBeenLastCalledWith("7", expect.objectContaining({ name: "", visibility: "private", definition: expect.objectContaining({ metric: { aggregate: "count" } }) })); await view.close();
 insights.detail.mockImplementation(async (_org?: unknown, kind?: unknown) => ({ resource: kind === "reports" ? { ...resource, dataset_id: 4, definition: { metric: { aggregate: "count" } } } : resource }));
 const edit = await render(createElement(InsightsQuery, { edit: true })); await edit.press("Back to record"); await edit.press("Choose filters"); await edit.press("Review query"); await edit.press("Save report"); await edit.press("Save"); expect(insights.updateReport).toHaveBeenLastCalledWith("7", "4", expect.objectContaining({ name: "Manual", status: "active" })); await edit.press("Visibility:"); await edit.press("Visibility:"); await edit.press("Status:"); await edit.press("Status:"); await edit.close();
});

