// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

const names = vi.hoisted(() => ["LendingHub", "LendingProductsDirectory", "LendingProductCreatePage", "LendingProductDetail",
  "LendingProductEditPage", "LendingApplicationsDirectory", "LendingApplicationCreatePage",
  "LendingApplicationDetail", "LendingApplicationEditPage", "LendingSchedulePage",
  "LendingReviewsDirectory", "LendingReviewDetail", "LendingReviewDecisionPage"]);
vi.mock("../../frontend/admin/src/screens/platform_lending_screen", () => Object.fromEntries(names.map(name =>
  [name, () => createElement("span", {}, name)])));

import Hub from "../../frontend/admin/src/app/platform/organizations/[id]/lending";
import Products from "../../frontend/admin/src/app/platform/organizations/[id]/lending/products";
import ProductCreate from "../../frontend/admin/src/app/platform/organizations/[id]/lending/products/create";
import ProductDetail from "../../frontend/admin/src/app/platform/organizations/[id]/lending/products/[recordId]";
import ProductEdit from "../../frontend/admin/src/app/platform/organizations/[id]/lending/products/[recordId]/edit";
import Applications from "../../frontend/admin/src/app/platform/organizations/[id]/lending/applications";
import ApplicationCreate from "../../frontend/admin/src/app/platform/organizations/[id]/lending/applications/create";
import ApplicationDetail from "../../frontend/admin/src/app/platform/organizations/[id]/lending/applications/[recordId]";
import ApplicationEdit from "../../frontend/admin/src/app/platform/organizations/[id]/lending/applications/[recordId]/edit";
import Schedule from "../../frontend/admin/src/app/platform/organizations/[id]/lending/applications/[recordId]/schedule";
import Reviews from "../../frontend/admin/src/app/platform/organizations/[id]/lending/reviews";
import ReviewDetail from "../../frontend/admin/src/app/platform/organizations/[id]/lending/reviews/[recordId]";
import ReviewDecide from "../../frontend/admin/src/app/platform/organizations/[id]/lending/reviews/[recordId]/decide";

it.each([[Hub, names[0]], [Products, names[1]], [ProductCreate, names[2]], [ProductDetail, names[3]],
  [ProductEdit, names[4]], [Applications, names[5]], [ApplicationCreate, names[6]],
  [ApplicationDetail, names[7]], [ApplicationEdit, names[8]], [Schedule, names[9]],
  [Reviews, names[10]], [ReviewDetail, names[11]], [ReviewDecide, names[12]]] as const)
  ("binds the Lending route to %s", (Page, expected) => {
    expect(renderToStaticMarkup(createElement(Page))).toBe(`<span>${expected}</span>`);
  });
