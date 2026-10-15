// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("../../frontend/admin/src/screens/platform_builder_screen", () => Object.fromEntries([
  "BuilderDirectory", "BuilderCreatePage", "BuilderEditPage", "BuilderDetail", "BuilderPreview",
].map(name => [name, () => createElement("span", {}, name)])));

import Directory from "../../frontend/admin/src/app/platform/organizations/[id]/builder/pages";
import Create from "../../frontend/admin/src/app/platform/organizations/[id]/builder/pages/create";
import Detail from "../../frontend/admin/src/app/platform/organizations/[id]/builder/pages/[pageId]";
import Edit from "../../frontend/admin/src/app/platform/organizations/[id]/builder/pages/[pageId]/edit";
import Preview from "../../frontend/admin/src/app/platform/organizations/[id]/builder/pages/[pageId]/render";

it.each([
  [Directory, "BuilderDirectory"],
  [Create, "BuilderCreatePage"],
  [Detail, "BuilderDetail"],
  [Edit, "BuilderEditPage"],
  [Preview, "BuilderPreview"],
] as const)("binds each Builder route to its intended screen: %s", (Page, expected) => {
  expect(renderToStaticMarkup(createElement(Page))).toBe(`<span>${expected}</span>`);
});
