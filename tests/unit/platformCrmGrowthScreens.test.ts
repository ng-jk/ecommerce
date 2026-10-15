// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "../../packages/api-client";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const routing = vi.hoisted(() => ({
  push: vi.fn(), replace: vi.fn(),
  params: { id: "7", recordId: "4", pipelineId: "", dealId: "" },
}));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return { router: routing, useLocalSearchParams: () => routing.params,
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]) };
});
const pipeline = { id: 4, code: "sales", name: "Sales", version: 1 };
const stage = { id: 4, pipeline_id: 2, code: "intake", name: "Intake", position: 10, outcome: "open", version: 1 };
const deal = { id: 4, pipeline_id: 2, stage_id: 3, company_id: null, contact_id: null,
  assignee_platform_user_id: null, title: "Renewal", amount_minor: 2500, currency: "USD", status: "open", version: 1 };
const activity = { id: 4, deal_id: 3, type: "call", summary: "Called", occurred_at: "2026-10-13T10:00:00+00:00" };
const stageOptions = { outcome: { open: "Open", won: "Won", lost: "Lost" } };
const dealOptions = { status: { open: "Open", won: "Won" } };
const activityOptions: { type: Record<string, string> } = { type: { call: "Call", note: "Note" } };
const page = { current_page: 1, last_page: 2, total: 2, per_page: 1 };
const crm = {
  pipelines: vi.fn(async () => ({ data: [pipeline], meta: page })),
  pipeline: vi.fn(async () => ({ pipeline })),
  createPipeline: vi.fn(async () => ({ pipeline })),
  updatePipeline: vi.fn(async () => ({ pipeline })),
  stages: vi.fn(async () => ({ data: [stage], meta: { ...page, options: stageOptions } })),
  stage: vi.fn(async () => ({ stage, options: stageOptions })),
  createStage: vi.fn(async () => ({ stage, options: stageOptions })),
  updateStage: vi.fn(async () => ({ stage, options: stageOptions })),
  deals: vi.fn(async () => ({ data: [deal], meta: { ...page, options: dealOptions } })),
  deal: vi.fn(async () => ({ deal, options: dealOptions })),
  createDeal: vi.fn(async () => ({ deal, options: dealOptions })),
  updateDeal: vi.fn(async () => ({ deal, options: dealOptions })),
  advanceDeal: vi.fn(async () => ({ deal: { ...deal, version: 2 }, options: dealOptions })),
  activities: vi.fn(async (_org: string, _page: number, _deal: string, _filter: string) => ({ data: [activity], meta: { ...page, options: activityOptions } })),
  activity: vi.fn(async () => ({ activity, options: activityOptions })),
  createActivity: vi.fn(async () => ({ activity, options: activityOptions })),
};
const session = { api: { crm }, user: { id: 9 } as { id: number } | null };
vi.mock("../../frontend/admin/src/screens/platform_shell_screen", () => ({
  usePlatformSession: () => session,
  PlatformPage: ({ title, children }: { title: string; children: ReactNode }) =>
    createElement("main", {}, createElement("h1", {}, title), children),
  PlatformText: ({ children }: { children: ReactNode }) => createElement("p", {}, children),
  PlatformButton: ({ title, onPress, disabled }: { title: string; onPress(): void; disabled?: boolean }) =>
    createElement("button", { onClick: onPress, disabled }, title),
  PlatformField: ({ label, value, onChangeText }: {
    label: string; value: string; onChangeText(value: string): void;
  }) => createElement("input", { "aria-label": label, value,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChangeText(event.currentTarget.value) }),
}));
import { CrmSales, GrowthCreatePage, GrowthDirectory, GrowthEditPage, GrowthRecordPage } from
  "../../frontend/admin/src/screens/platform_crm_growth_screen";
import { GrowthForm } from "../../frontend/admin/src/screens/platform_crm_growth_screen/interface/Form";
import type { GrowthKind } from "../../frontend/admin/src/screens/platform_crm_growth_screen/logic/model";
import { useGrowthDirectory } from "../../frontend/admin/src/screens/platform_crm_growth_screen/logic/useGrowthDirectory";
import { useGrowthRecord } from "../../frontend/admin/src/screens/platform_crm_growth_screen/logic/useGrowthRecord";

beforeEach(() => {
  vi.clearAllMocks();
  session.user = { id: 9 };
  Object.assign(routing.params, { id: "7", recordId: "4", pipelineId: "", dealId: "" });
  crm.pipelines.mockResolvedValue({ data: [pipeline], meta: page });
  crm.stages.mockResolvedValue({ data: [stage], meta: { ...page, options: stageOptions } });
  crm.deals.mockResolvedValue({ data: [deal], meta: { ...page, options: dealOptions } });
  crm.activities.mockResolvedValue({ data: [activity], meta: { ...page, options: activityOptions } });
  crm.pipeline.mockResolvedValue({ pipeline });
  crm.stage.mockResolvedValue({ stage, options: stageOptions });
  crm.deal.mockResolvedValue({ deal, options: dealOptions });
  crm.activity.mockResolvedValue({ activity, options: activityOptions });
});

async function render(element: React.ReactElement) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => { root.render(element); });
  return {
    container,
    button(label: string) { return [...container.querySelectorAll("button")].find(item => item.textContent?.includes(label))!; },
    async press(label: string) { await act(async () => { this.button(label).click(); }); },
    async fill(label: string, value: string) {
      const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    },
    async close() { await act(async () => root.unmount()); },
  };
}

it("provides a Sales hub and bounded indexed directories for every growth record", async () => {
  const hub = await render(createElement(CrmSales));
  for (const kind of ["pipelines", "stages", "deals", "activities"] as GrowthKind[]) {
    await hub.press(kind[0]!.toUpperCase() + kind.slice(1));
    expect(routing.push).toHaveBeenCalledWith(`/platform/organizations/7/crm/${kind}`);
    const list = await render(createElement(GrowthDirectory, { kind }));
    if (kind === "stages") {
      expect(list.button("Create").disabled).toBe(true);
      await list.fill("Pipeline ID", "2");
      expect(crm.stages).toHaveBeenCalledWith("7", "2", 1, "");
    }
    if (kind === "deals") await list.fill("Pipeline ID", "2");
    expect(list.container.textContent).toContain(kind === "deals" ? "Renewal"
      : kind === "activities" ? "Called" : kind === "stages" ? "Intake" : "Sales");
    await list.press(kind === "deals" ? "Renewal" : kind === "activities" ? "Called"
      : kind === "stages" ? "Intake · intake" : "Sales · sales");
    expect(routing.push).toHaveBeenCalledWith(`/platform/organizations/7/crm/${kind}/4`);
    if (kind === "activities") {
      await list.press("Filter:");
      expect(crm.activities).toHaveBeenLastCalledWith("7", 1, "", "call");
    }
    await list.press("Next");
    await list.press("Previous");
    await list.press("Create");
    expect(routing.push).toHaveBeenCalledWith(`/platform/organizations/7/crm/${kind}/create${kind === "stages" ? "?pipelineId=2" : ""}`);
    await list.press("Sales");
    await list.close();
  }
  await hub.press("CRM");
  expect(routing.replace).toHaveBeenCalledWith("/platform/organizations/7/crm");
  await hub.close();
});

it("renders authorized detail navigation and advances only open deals with their version", async () => {
  for (const kind of ["pipelines", "stages", "deals", "activities"] as GrowthKind[]) {
    const detail = await render(createElement(GrowthRecordPage, { kind }));
    expect(detail.container.textContent).toContain(kind === "deals" ? "2500 USD minor units"
      : kind === "activities" ? "Type: Call" : "Code:");
    if (kind !== "activities") await detail.press("Edit");
    if (kind === "pipelines") await detail.press("Stages");
    if (kind === "stages") await detail.press("Pipeline");
    if (kind === "activities") await detail.press("Deal");
    if (kind === "deals") {
      await detail.press("Stages");
      await detail.press("Activities");
      await detail.press("Advance deal");
      expect(detail.container.textContent).toContain("valid next stage ID");
      await detail.fill("Next stage ID", "6");
      await detail.press("Advance deal");
      expect(crm.advanceDeal).toHaveBeenCalledWith("7", "4", { stage_id: 6, expected_version: 1 });
    }
    await detail.press("All");
    await detail.close();
  }
});

it("creates and edits through shared full-page forms with versioned writes and model-owned choices", async () => {
  const pipelineCreate = await render(createElement(GrowthCreatePage, { kind: "pipelines" }));
  await pipelineCreate.fill("Code", "SALES");
  await pipelineCreate.fill("Name", "Sales");
  await pipelineCreate.press("Create");
  expect(crm.createPipeline).toHaveBeenCalledWith("7", { code: "sales", name: "Sales" });
  await pipelineCreate.close();

  routing.params.pipelineId = "2";
  const stageCreate = await render(createElement(GrowthCreatePage, { kind: "stages" }));
  await stageCreate.fill("Code", "INTAKE");
  await stageCreate.fill("Name", "Intake");
  await stageCreate.fill("Position", "10");
  await stageCreate.press("Outcome:");
  await stageCreate.press("Create");
  expect(crm.createStage).toHaveBeenCalledWith("7", {
    pipeline_id: 2, code: "intake", name: "Intake", position: 10, outcome: "open",
  });
  await stageCreate.close();

  const dealCreate = await render(createElement(GrowthCreatePage, { kind: "deals" }));
  await dealCreate.fill("Title", "Renewal");
  await dealCreate.fill("Pipeline ID", "2");
  await dealCreate.fill("Starting stage ID", "3");
  await dealCreate.fill("Amount in minor units", "2500");
  await dealCreate.fill("Currency code", "usd");
  await dealCreate.press("Create");
  expect(crm.createDeal).toHaveBeenCalledWith("7", {
    pipeline_id: 2, stage_id: 3, title: "Renewal", company_id: null, contact_id: null,
    assignee_platform_user_id: null, amount_minor: 2500, currency: "USD",
  });
  await dealCreate.close();

  routing.params.dealId = "3";
  const activityCreate = await render(createElement(GrowthCreatePage, { kind: "activities" }));
  await activityCreate.press("Type:");
  await activityCreate.fill("Summary", "Called");
  await activityCreate.press("Create");
  expect(crm.createActivity).toHaveBeenCalledWith("7", expect.objectContaining({
    deal_id: 3, type: "call", summary: "Called",
  }));
  await activityCreate.close();

  for (const kind of ["pipelines", "stages", "deals"] as const) {
    const edit = await render(createElement(GrowthEditPage, { kind }));
    if (kind === "deals") {
      await edit.fill("Company ID (optional)", "5");
      await edit.fill("Assignee ID (optional)", "9");
    } else await edit.fill("Name", "Changed");
    await edit.press("Save changes");
    await edit.press("Cancel");
    await edit.close();
  }
  expect(crm.updatePipeline).toHaveBeenCalledWith("7", 4, { name: "Changed", expected_version: 1 });
  expect(crm.updateStage).toHaveBeenCalledWith("7", 4, { name: "Changed", expected_version: 1 });
  expect(crm.updateDeal).toHaveBeenCalledWith("7", 4, expect.objectContaining({
    assignee_platform_user_id: 9, company_id: 5, expected_version: 1,
  }));
});

it("keeps guests out, handles load failures, validates local IDs and displays server field errors", async () => {
  session.user = null;
  for (const kind of ["pipelines", "stages", "deals", "activities"] as GrowthKind[]) {
    const list = await render(createElement(GrowthDirectory, { kind }));
    await list.press("Sign in");
    await list.close();
    const detail = await render(createElement(GrowthRecordPage, { kind }));
    await detail.press("Sign in");
    await detail.close();
    const create = await render(createElement(GrowthCreatePage, { kind }));
    expect(create.container.textContent).toContain("Sign in");
    await create.close();
  }
  session.user = { id: 9 };
  crm.pipelines.mockRejectedValueOnce(new Error("offline"));
  const list = await render(createElement(GrowthDirectory, { kind: "pipelines" }));
  expect(list.container.textContent).toContain("offline");
  await list.press("Retry");
  expect(list.container.textContent).toContain("Sales");
  await list.close();
  crm.deal.mockRejectedValueOnce(new Error("offline"));
  const detail = await render(createElement(GrowthRecordPage, { kind: "deals" }));
  await detail.press("Retry");
  expect(detail.container.textContent).toContain("Renewal");
  await detail.close();
  const form = await render(createElement(GrowthForm, { organizationId: "7", kind: "deals", initial: deal }));
  await form.fill("Assignee ID (optional)", "bad");
  await form.press("Save changes");
  expect(crm.updateDeal).not.toHaveBeenCalled();
  await form.fill("Assignee ID (optional)", "9");
  crm.updateDeal.mockRejectedValueOnce(new ApiError("Invalid", 422, "validation", {
    assignee_platform_user_id: ["Member unavailable"],
  }));
  await form.press("Save changes");
  expect(form.container.textContent).toContain("Member unavailable");
  await form.close();
});

it("preserves deal activity context and shows safe server failures while advancing", async () => {
  routing.params.dealId = "3";
  const activities = await render(createElement(GrowthDirectory, { kind: "activities" }));
  expect(crm.activities).toHaveBeenCalledWith("7", 1, "3", "");
  await activities.press("Create");
  expect(routing.push).toHaveBeenCalledWith("/platform/organizations/7/crm/activities/create?dealId=3");
  await activities.close();
  const detail = await render(createElement(GrowthRecordPage, { kind: "deals" }));
  await detail.fill("Next stage ID", "6");
  crm.advanceDeal.mockRejectedValueOnce(new ApiError("Invalid", 422, "validation", {
    stage_id: ["Stage unavailable"],
  }));
  await detail.press("Advance deal");
  expect(detail.container.textContent).toContain("Stage unavailable");
  crm.advanceDeal.mockRejectedValueOnce(new Error("connection lost"));
  await detail.press("Advance deal");
  expect(detail.container.textContent).toContain("connection lost");
  await detail.close();
  crm.activities.mockResolvedValueOnce({ data: [], meta: { ...page, last_page: 1, total: 0, options: activityOptions } });
  const empty = await render(createElement(GrowthDirectory, { kind: "activities" }));
  expect(empty.container.textContent).toContain("No activities");
  await empty.close();
});

it("handles unavailable options, guest edit, missing stage context and retryable form loads", async () => {
  const missing = await render(createElement(GrowthCreatePage, { kind: "stages" }));
  expect(missing.container.textContent).toContain("Open a pipeline first");
  await missing.close();
  session.user = null;
  const guestEdit = await render(createElement(GrowthEditPage, { kind: "deals" }));
  expect(guestEdit.container.textContent).toContain("Sign in");
  await guestEdit.close();
  session.user = { id: 9 };
  crm.deal.mockRejectedValueOnce(new Error("detail unavailable"));
  const edit = await render(createElement(GrowthEditPage, { kind: "deals" }));
  await edit.press("Retry");
  expect(edit.container.querySelector<HTMLInputElement>('input[aria-label="Title"]')?.value).toBe("Renewal");
  await edit.close();
  crm.activities.mockRejectedValueOnce(new Error("options unavailable"));
  const create = await render(createElement(GrowthCreatePage, { kind: "activities" }));
  await create.press("Retry");
  expect(create.container.textContent).toContain("Type:");
  await create.close();

  crm.stage.mockResolvedValueOnce({ stage: { ...stage, outcome: "legacy" }, options: stageOptions });
  const strangeStage = await render(createElement(GrowthRecordPage, { kind: "stages" }));
  expect(strangeStage.container.textContent).toContain("Unavailable");
  await strangeStage.close();
  crm.deal.mockResolvedValueOnce({ deal: { ...deal, status: "legacy" }, options: dealOptions });
  const strangeDeal = await render(createElement(GrowthRecordPage, { kind: "deals" }));
  expect(strangeDeal.container.textContent).toContain("Unavailable");
  await strangeDeal.close();
  crm.activity.mockResolvedValueOnce({ activity: { ...activity, type: "legacy" }, options: activityOptions });
  const strangeActivity = await render(createElement(GrowthRecordPage, { kind: "activities" }));
  expect(strangeActivity.container.textContent).toContain("Unavailable");
  await strangeActivity.close();
});

it("keeps model options fail closed and ignores advance on records without stages", async () => {
  const directStage = await render(createElement(GrowthForm, {
    organizationId: "7", kind: "stages", options: stageOptions.outcome,
  }));
  expect(directStage.container.querySelector('input[aria-label="Pipeline ID"]')).not.toBeNull();
  await directStage.close();
  const noOptions = await render(createElement(GrowthForm, { organizationId: "7", kind: "activities" }));
  await noOptions.press("Type:");
  expect(noOptions.container.textContent).toContain("Type: Choose");
  await noOptions.close();

  function DirectoryProbe() {
    const model = useGrowthDirectory("7", "stages");
    return createElement("button", { onClick: model.cycleFilter }, "Cycle");
  }
  const directoryProbe = await render(createElement(DirectoryProbe));
  await directoryProbe.press("Cycle");
  await directoryProbe.close();

  function RecordProbe() {
    const model = useGrowthRecord("7", "pipelines", "4");
    return createElement("button", { onClick: () => void model.advance() }, "Advance");
  }
  const recordProbe = await render(createElement(RecordProbe));
  await recordProbe.press("Advance");
  expect(crm.advanceDeal).not.toHaveBeenCalled();
  await recordProbe.close();
});

it("recovers when an activity filter option is withdrawn between pages", async () => {
  crm.activities.mockImplementation(async (_org: string, _page: number, _deal: string, filter: string) => ({
    data: [activity], meta: { ...page, options: { type: filter ? {} : activityOptions.type } },
  }));
  const list = await render(createElement(GrowthDirectory, { kind: "activities" }));
  await list.press("Filter:");
  expect(list.container.textContent).toContain("Unavailable");
  await list.press("Filter:");
  expect(crm.activities).toHaveBeenLastCalledWith("7", 1, "", "");
  await list.close();
});
