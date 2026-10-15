// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("../../frontend/admin/src/screens/platform_crm_growth_screen", () => ({
  GrowthDirectory: ({ kind }: { kind: string }) => createElement("span", {}, `directory:${kind}`),
  GrowthCreatePage: ({ kind }: { kind: string }) => createElement("span", {}, `create:${kind}`),
  GrowthRecordPage: ({ kind }: { kind: string }) => createElement("span", {}, `detail:${kind}`),
  GrowthEditPage: ({ kind }: { kind: string }) => createElement("span", {}, `edit:${kind}`),
  CrmSales: () => createElement("span", {}, "sales"),
}));

import ActivityCreate from "../../frontend/admin/src/app/platform/organizations/[id]/crm/activities/create";
import Activities from "../../frontend/admin/src/app/platform/organizations/[id]/crm/activities";
import ActivityDetail from "../../frontend/admin/src/app/platform/organizations/[id]/crm/activities/[recordId]";
import DealCreate from "../../frontend/admin/src/app/platform/organizations/[id]/crm/deals/create";
import Deals from "../../frontend/admin/src/app/platform/organizations/[id]/crm/deals";
import DealDetail from "../../frontend/admin/src/app/platform/organizations/[id]/crm/deals/[recordId]";
import DealEdit from "../../frontend/admin/src/app/platform/organizations/[id]/crm/deals/[recordId]/edit";
import PipelineCreate from "../../frontend/admin/src/app/platform/organizations/[id]/crm/pipelines/create";
import Pipelines from "../../frontend/admin/src/app/platform/organizations/[id]/crm/pipelines";
import PipelineDetail from "../../frontend/admin/src/app/platform/organizations/[id]/crm/pipelines/[recordId]";
import PipelineEdit from "../../frontend/admin/src/app/platform/organizations/[id]/crm/pipelines/[recordId]/edit";
import Sales from "../../frontend/admin/src/app/platform/organizations/[id]/crm/sales";
import StageCreate from "../../frontend/admin/src/app/platform/organizations/[id]/crm/stages/create";
import Stages from "../../frontend/admin/src/app/platform/organizations/[id]/crm/stages";
import StageDetail from "../../frontend/admin/src/app/platform/organizations/[id]/crm/stages/[recordId]";
import StageEdit from "../../frontend/admin/src/app/platform/organizations/[id]/crm/stages/[recordId]/edit";

it.each([
  [Activities, "directory:activities"], [ActivityCreate, "create:activities"],
  [ActivityDetail, "detail:activities"],
  [Deals, "directory:deals"], [DealCreate, "create:deals"],
  [DealDetail, "detail:deals"], [DealEdit, "edit:deals"],
  [Pipelines, "directory:pipelines"], [PipelineCreate, "create:pipelines"],
  [PipelineDetail, "detail:pipelines"], [PipelineEdit, "edit:pipelines"],
  [Sales, "sales"],
  [Stages, "directory:stages"], [StageCreate, "create:stages"],
  [StageDetail, "detail:stages"], [StageEdit, "edit:stages"],
] as const)("binds each CRM growth route to its intended resource and mode: %s", (Page, expected) => {
  expect(renderToStaticMarkup(createElement(Page))).toBe(`<span>${expected}</span>`);
});
