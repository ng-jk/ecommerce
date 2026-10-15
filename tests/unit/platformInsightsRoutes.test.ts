// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("../../frontend/admin/src/screens/platform_insights_screen", () => Object.fromEntries(
 ["InsightsHub", "InsightsDirectory", "InsightsRecord", "DatasetForm", "DatasetImport", "DashboardForm", "InsightsQuery"].map(name => [name, (props: { kind?: string; edit?: boolean }) => createElement("span", {}, `${name}:${props.kind ?? ""}:${props.edit ? "edit" : "create"}`)])));
import Page0 from "../../frontend/admin/src/app/platform/organizations/[id]/insights/dashboards/[recordId]/edit";
import Page1 from "../../frontend/admin/src/app/platform/organizations/[id]/insights/dashboards/[recordId]/index";
import Page2 from "../../frontend/admin/src/app/platform/organizations/[id]/insights/dashboards/create";
import Page3 from "../../frontend/admin/src/app/platform/organizations/[id]/insights/dashboards/index";
import Page4 from "../../frontend/admin/src/app/platform/organizations/[id]/insights/datasets/[recordId]/edit";
import Page5 from "../../frontend/admin/src/app/platform/organizations/[id]/insights/datasets/[recordId]/import";
import Page6 from "../../frontend/admin/src/app/platform/organizations/[id]/insights/datasets/[recordId]/index";
import Page7 from "../../frontend/admin/src/app/platform/organizations/[id]/insights/datasets/[recordId]/query";
import Page8 from "../../frontend/admin/src/app/platform/organizations/[id]/insights/datasets/create";
import Page9 from "../../frontend/admin/src/app/platform/organizations/[id]/insights/datasets/index";
import Page10 from "../../frontend/admin/src/app/platform/organizations/[id]/insights/index";
import Page11 from "../../frontend/admin/src/app/platform/organizations/[id]/insights/reports/[recordId]/edit";
import Page12 from "../../frontend/admin/src/app/platform/organizations/[id]/insights/reports/[recordId]/index";
import Page13 from "../../frontend/admin/src/app/platform/organizations/[id]/insights/reports/index";
it.each([
  [Page0, "DashboardForm::edit"],
  [Page1, "InsightsRecord:dashboards:create"],
  [Page2, "DashboardForm::create"],
  [Page3, "InsightsDirectory:dashboards:create"],
  [Page4, "DatasetForm::edit"],
  [Page5, "DatasetImport::create"],
  [Page6, "InsightsRecord:datasets:create"],
  [Page7, "InsightsQuery::create"],
  [Page8, "DatasetForm::create"],
  [Page9, "InsightsDirectory:datasets:create"],
  [Page10, "InsightsHub::create"],
  [Page11, "InsightsQuery::edit"],
  [Page12, "InsightsRecord:reports:create"],
  [Page13, "InsightsDirectory:reports:create"]
] as const)("binds each Insights route to its intended typed screen: %s", (Page, expected) => {
 expect(renderToStaticMarkup(createElement(Page))).toBe(`<span>${expected}</span>`);
});
