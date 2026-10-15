// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiError, type LendingApplication } from "../../packages/api-client";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const routing = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), params: {
  id: "7", recordId: "3", productId: "2",
} }));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return { router: routing, useLocalSearchParams: () => routing.params,
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]) };
});
const product = { id: 2, code: "basic", name: "Basic", jurisdiction_label: "Local",
  terms_text: "Whole-term flat charge", currency: "USD", minor_unit_digits: 2,
  principal_min_minor: 100, principal_max_minor: 1000, term_rate_numerator: 1,
  term_rate_denominator: 10, installment_count: 2, interval_days: 30, status: "active", version: 1 };
const application: LendingApplication = { id: 3, applicant_platform_user_id: 9, product_id: 2,
  principal_minor: 200, first_due_date: "2026-11-01", purpose: "Inventory", status: "draft", version: 1 };
const termsSnapshot = { product_id: 2, product_version: 1, principal_minor: 200,
  first_due_date: "2026-11-01", jurisdiction_label: "Local", currency: "USD",
  minor_unit_digits: 2, terms_text: "Original whole-term terms",
  term_rate_numerator: 1, term_rate_denominator: 10,
  installment_count: 2, interval_days: 30 };
const productOptions: Record<string, string> = { draft: "Draft", active: "Active", disabled: "Disabled" };
const applicationOptions: Record<string, string> = { draft: "Draft", submitted: "Submitted", approved: "Approved", rejected: "Rejected", withdrawn: "Withdrawn" };
const meta = { current_page: 1, per_page: 2, last_page: 2, total: 3 };
const lending = {
  products: vi.fn(async () => ({ data: [product], meta: { ...meta, options: productOptions } })),
  product: vi.fn(async () => ({ product, options: productOptions })),
  createProduct: vi.fn(async () => ({ product, options: productOptions })),
  updateProduct: vi.fn(async () => ({ product, options: productOptions })),
  applications: vi.fn(async () => ({ data: [application], meta: { ...meta, options: applicationOptions } })),
  application: vi.fn(async () => ({ application, options: applicationOptions })),
  createApplication: vi.fn(async () => ({ application, options: applicationOptions })),
  updateApplication: vi.fn(async () => ({ application, options: applicationOptions })),
  submitApplication: vi.fn(async () => ({ application: { ...application, status: "submitted" }, options: applicationOptions })),
  withdrawApplication: vi.fn(async () => ({ application: { ...application, status: "withdrawn" }, options: applicationOptions })),
  schedule: vi.fn(async () => ({ application_id: 3, application_version: 1, currency: "USD", minor_unit_digits: 2,
    principal_minor: 200, charge_minor: 20, total_minor: 220,
    installments: [{ number: 1, due_date: "2026-11-01", principal_minor: 100, charge_minor: 10, total_minor: 110 }] })),
  reviews: vi.fn(async () => ({ data: [application], meta: { ...meta, options: applicationOptions } })),
  review: vi.fn(async (): Promise<{ application: LendingApplication; options: Record<string, string> }> => ({ application: { ...application, status: "submitted", terms_snapshot: termsSnapshot }, options: applicationOptions })),
  decideReview: vi.fn(async () => ({ application: { ...application, status: "approved" }, options: applicationOptions })),
};
const workspace = { catalog: vi.fn(async () => ({ data: [{ application_key: "lending", name: "Lending",
  available: true, entitled: true, state: "installed" }], meta: { current_page: 1, last_page: 1, per_page: 4, total: 1 } })) };
const session = { api: { lending, workspace }, user: { id: 9 } as { id: number } | null };
vi.mock("../../frontend/admin/src/screens/platform_shell_screen", () => ({
  usePlatformSession: () => session,
  PlatformPage: ({ title, children }: { title: string; children: ReactNode }) =>
    createElement("main", {}, createElement("h1", {}, title), children),
  PlatformText: ({ children }: { children: ReactNode }) => createElement("p", {}, children),
  PlatformButton: ({ title, onPress, disabled }: { title: string; onPress(): void; disabled?: boolean }) =>
    createElement("button", { onClick: onPress, disabled }, title),
  PlatformField: ({ label, value, onChangeText }: { label: string; value: string; onChangeText(value: string): void }) =>
    createElement("input", { "aria-label": label, value,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChangeText(event.currentTarget.value) }),
}));

import { LendingHub, LendingProductsDirectory, LendingProductCreatePage, LendingProductEditPage,
  LendingProductDetail, LendingApplicationsDirectory, LendingApplicationCreatePage, LendingApplicationEditPage,
  LendingApplicationDetail, LendingSchedulePage, LendingReviewsDirectory, LendingReviewDetail,
  LendingReviewDecisionPage } from "../../frontend/admin/src/screens/platform_lending_screen";
import { lendingPath, nextOption, numericInput, statusLabel } from "../../frontend/admin/src/screens/platform_lending_screen/logic/model";
import { useLendingDirectory } from "../../frontend/admin/src/screens/platform_lending_screen/logic/queries";
import { PlatformServices } from "../../frontend/admin/src/screens/platform_services_screen";

beforeEach(() => {
  vi.clearAllMocks();
  session.user = { id: 9 };
  lending.products.mockResolvedValue({ data: [product], meta: { ...meta, options: productOptions } });
  lending.product.mockResolvedValue({ product, options: productOptions });
  lending.application.mockResolvedValue({ application, options: applicationOptions });
  lending.reviews.mockResolvedValue({ data: [application], meta: { ...meta, options: applicationOptions } });
  lending.review.mockResolvedValue({ application: { ...application, status: "submitted", terms_snapshot: termsSnapshot }, options: applicationOptions });
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

it("uses model options for status and bounded directory navigation", async () => {
  expect(statusLabel(productOptions, "active")).toBe("Active");
  expect(statusLabel(productOptions, "future")).toBe("Unavailable status");
  expect(nextOption(productOptions, "active")).toBe("disabled");
  expect(nextOption({}, "")).toBe("");
  expect(Number.isNaN(numericInput(""))).toBe(true);
  expect(numericInput("20")).toBe(20);
  expect(lendingPath("7", "products", 2)).toBe("/platform/organizations/7/lending/products/2");
  const hub = await render(createElement(LendingHub));
  await hub.press("Services"); await hub.press("Products"); await hub.press("My applications"); await hub.press("Reviews");
  await hub.close();
  const list = await render(createElement(LendingProductsDirectory));
  expect(lending.products).toHaveBeenCalledWith("7", 1, "", 2);
  await list.press("Status:"); expect(lending.products).toHaveBeenLastCalledWith("7", 1, "draft", 2);
  await list.press("Next"); await list.press("Previous");
  await list.press("basic"); await list.press("Create product");
  expect(list.container.querySelectorAll("button").length).toBeLessThanOrEqual(7);
  await list.close();
});

it("opens installed Lending from the organization service hub", async () => {
  const services = await render(createElement(PlatformServices));
  await services.press("Lending");
  expect(routing.push).toHaveBeenCalledWith(lendingPath("7"));
  await services.close();
});

it("uses a shared three-step product form for standalone create and edit", async () => {
  const create = await render(createElement(LendingProductCreatePage));
  expect(create.container.querySelectorAll("button,input").length).toBeLessThanOrEqual(7);
  await create.press("Next step");
  expect(create.container.querySelectorAll("button,input").length).toBeLessThanOrEqual(7);
  await create.press("Next step");
  expect(create.container.querySelectorAll("button,input").length).toBeLessThanOrEqual(7);
  await create.press("Previous step");
  await create.close();
  const edit = await render(createElement(LendingProductEditPage));
  await edit.press("Status:");
  await edit.press("Next step"); await edit.press("Next step"); await edit.press("Save product");
  expect(lending.updateProduct).toHaveBeenCalledWith("7", 2,
    expect.objectContaining({ expected_version: 1, status: "disabled", principal_min_minor: 100 }));
  await edit.close();
});

it("submits versioned applications, shows approved schedules, and decides reviews", async () => {
  const detail = await render(createElement(LendingApplicationDetail));
  await detail.press("Edit draft");
  await detail.press("Submit");
  expect(lending.submitApplication).toHaveBeenCalledWith("7", 3, { expected_version: 1 });
  await detail.press("Withdraw");
  expect(lending.withdrawApplication).toHaveBeenCalledWith("7", 3, { expected_version: 1 });
  await detail.close();
  const schedule = await render(createElement(LendingSchedulePage));
  expect(schedule.container.textContent).toContain("whole-term charge 20");
  await schedule.press("Application");
  await schedule.close();
  const decision = await render(createElement(LendingReviewDecisionPage));
  await decision.fill("Decision note", "Reviewed terms");
  await decision.press("Approve");
  expect(lending.decideReview).toHaveBeenCalledWith("7", 3,
    { expected_version: 1, decision: "approved", decision_note: "Reviewed terms" });
  await decision.close();
});

it("creates product terms and renders product details with available apply action", async () => {
  const create = await render(createElement(LendingProductCreatePage));
  await create.fill("Code", "basic"); await create.fill("Name", "Basic");
  await create.fill("Jurisdiction label", "Local"); await create.fill("Terms text", "Whole-term flat charge");
  await create.press("Next step");
  await create.fill("Currency code", "USD"); await create.fill("Minor unit digits", "2");
  await create.fill("Minimum principal, minor units", "100");
  await create.fill("Maximum principal, minor units", "1000");
  await create.press("Next step");
  await create.fill("Whole-term charge numerator", "1");
  await create.fill("Whole-term charge denominator", "10");
  await create.fill("Installments", "2"); await create.fill("Days between installments", "30");
  await create.press("Create product");
  expect(lending.createProduct).toHaveBeenCalledWith("7", expect.objectContaining({
    code: "basic", name: "Basic", principal_min_minor: 100, term_rate_numerator: 1,
  }));
  expect(routing.replace).toHaveBeenCalledWith(lendingPath("7", "products", 2));
  await create.press("Cancel"); await create.close();
  const detail = await render(createElement(LendingProductDetail));
  expect(detail.container.textContent).toContain("Whole-term flat charge");
  await detail.press("Apply"); await detail.press("Edit product"); await detail.press("Products");
  await detail.close();
});

it("creates and edits drafts with versioned fields, and lists applicant and reviewer pages", async () => {
  const applicant = await render(createElement(LendingApplicationsDirectory));
  await applicant.press("Status:"); await applicant.press("Next"); await applicant.press("Previous");
  await applicant.press("Start application"); await applicant.press("#3"); await applicant.close();
  const reviewer = await render(createElement(LendingReviewsDirectory));
  await reviewer.press("Status:"); await reviewer.press("Next"); await reviewer.press("Previous");
  await reviewer.press("#3"); await reviewer.close();
  const create = await render(createElement(LendingApplicationCreatePage));
  await create.fill("Principal, minor units", "200");
  await create.fill("First due date (YYYY-MM-DD, UTC)", "2026-11-01");
  await create.fill("Purpose", "Inventory"); await create.press("Create draft");
  expect(lending.createApplication).toHaveBeenCalledWith("7", { product_id: 2,
    principal_minor: 200, first_due_date: "2026-11-01", purpose: "Inventory" });
  await create.press("Cancel"); await create.close();
  const edit = await render(createElement(LendingApplicationEditPage));
  await edit.press("Save draft");
  expect(lending.updateApplication).toHaveBeenCalledWith("7", 3, { expected_version: 1,
    principal_minor: 200, first_due_date: "2026-11-01", purpose: "Inventory" });
  await edit.press("Cancel"); await edit.close();
});

it("shows immutable and approval states, reviewer decisions, and authenticated fallbacks", async () => {
  lending.product.mockResolvedValueOnce({ product: { ...product, status: "disabled" }, options: productOptions });
  const disabled = await render(createElement(LendingProductDetail));
  expect(disabled.button("Apply")).toBeUndefined(); await disabled.close();
  lending.application.mockResolvedValueOnce({ application: { ...application, status: "approved" }, options: applicationOptions });
  const approved = await render(createElement(LendingApplicationDetail));
  await approved.press("Schedule"); await approved.close();
  lending.application.mockResolvedValueOnce({ application: { ...application, status: "submitted" }, options: applicationOptions });
  const immutable = await render(createElement(LendingApplicationEditPage));
  expect(immutable.container.textContent).toContain("immutable"); await immutable.close();
  const review = await render(createElement(LendingReviewDetail));
  await review.press("Decide"); await review.press("Reviews"); await review.close();
  const reject = await render(createElement(LendingReviewDecisionPage));
  await reject.fill("Decision note", "Insufficient terms"); await reject.press("Reject");
  expect(lending.decideReview).toHaveBeenCalledWith("7", 3,
    { expected_version: 1, decision: "rejected", decision_note: "Insufficient terms" });
  await reject.press("Review"); await reject.close();
  session.user = null;
  const signedOut = await render(createElement(LendingProductDetail));
  expect(signedOut.container.textContent).toContain("Sign in"); await signedOut.close();
});

it("shows submitted terms frozen before a product change on application, review, and decision pages", async () => {
  const frozen = termsSnapshot;
  const submitted = { ...application, status: "submitted", terms_snapshot: frozen };
  lending.product.mockResolvedValue({ product: { ...product, version: 2,
    terms_text: "New product terms", term_rate_numerator: 3 }, options: productOptions });
  lending.application.mockResolvedValue({ application: submitted, options: applicationOptions });
  lending.review.mockResolvedValue({ application: submitted, options: applicationOptions });
  const applicant = await render(createElement(LendingApplicationDetail));
  expect(applicant.container.textContent).toContain("Original whole-term terms");
  expect(applicant.container.textContent).toContain("product version 1");
  expect(applicant.container.textContent).toContain("Jurisdiction: Local; currency: USD");
  expect(applicant.container.textContent).toContain("Flat whole-term rate: 1/10; 2 installments every 30 days");
  expect(applicant.container.textContent).not.toContain("New product terms");
  await applicant.close();
  const reviewer = await render(createElement(LendingReviewDetail));
  expect(reviewer.container.textContent).toContain("Original whole-term terms");
  expect(reviewer.container.textContent).not.toContain("New product terms");
  await reviewer.close();
  const decision = await render(createElement(LendingReviewDecisionPage));
  expect(decision.container.textContent).toContain("Original whole-term terms");
  expect(decision.container.textContent).toContain("Frozen principal: 200 minor units; first due 2026-11-01");
  expect(decision.container.textContent).not.toContain("New product terms");
  await decision.close();
  expect(lending.product).not.toHaveBeenCalled();
});

it("renders authentication, loading, and retry states for every Lending data page", async () => {
  const pages = [
    [LendingProductsDirectory, lending.products], [LendingProductCreatePage, lending.products],
    [LendingProductDetail, lending.product], [LendingProductEditPage, lending.product],
    [LendingApplicationsDirectory, lending.applications], [LendingApplicationCreatePage, lending.products],
    [LendingApplicationDetail, lending.application], [LendingApplicationEditPage, lending.application],
    [LendingReviewsDirectory, lending.reviews], [LendingReviewDetail, lending.review],
    [LendingReviewDecisionPage, lending.review], [LendingSchedulePage, lending.schedule],
  ] as const;
  for (const [Page, request] of pages) {
    session.user = null;
    const signedOut = await render(createElement(Page));
    expect(signedOut.container.textContent).toContain("Sign in");
    await signedOut.close();
    session.user = { id: 9 };
    request.mockImplementationOnce(() => new Promise<never>(() => {}));
    const loading = await render(createElement(Page));
    expect(loading.container.textContent).toContain("Loading");
    await loading.close();
    request.mockRejectedValueOnce(new ApiError("Unavailable", 503));
    const failed = await render(createElement(Page));
    expect(failed.container.textContent).toContain("Unavailable");
    await failed.press("Retry");
    expect(request).toHaveBeenCalledTimes(3);
    await failed.close();
    request.mockReset();
    if (request === lending.products) lending.products.mockResolvedValue({ data: [product], meta: { ...meta, options: productOptions } });
    else if (request === lending.applications) lending.applications.mockResolvedValue({ data: [application], meta: { ...meta, options: applicationOptions } });
    else if (request === lending.reviews) lending.reviews.mockResolvedValue({ data: [application], meta: { ...meta, options: applicationOptions } });
    else if (request === lending.product) lending.product.mockResolvedValue({ product, options: productOptions });
    else if (request === lending.application) lending.application.mockResolvedValue({ application, options: applicationOptions });
    else if (request === lending.review) lending.review.mockResolvedValue({ application: { ...application, status: "submitted", terms_snapshot: termsSnapshot }, options: applicationOptions });
    else lending.schedule.mockResolvedValue({ application_id: 3, application_version: 1, currency: "USD", minor_unit_digits: 2,
      principal_minor: 200, charge_minor: 20, total_minor: 220, installments: [] });
  }
});

it("shows empty paginated directories and applications without a selected product", async () => {
  lending.products.mockResolvedValueOnce({ data: [], meta: { ...meta, options: productOptions } });
  const products = await render(createElement(LendingProductsDirectory));
  expect(products.container.textContent).toContain("No records");
  await products.press("Lending"); await products.close();
  lending.applications.mockResolvedValueOnce({ data: [], meta: { ...meta, options: applicationOptions } });
  const applicants = await render(createElement(LendingApplicationsDirectory));
  expect(applicants.container.textContent).toContain("No records"); await applicants.close();
  lending.reviews.mockResolvedValueOnce({ data: [], meta: { ...meta, options: applicationOptions } });
  const reviews = await render(createElement(LendingReviewsDirectory));
  expect(reviews.container.textContent).toContain("No records"); await reviews.close();
  routing.params.productId = "";
  const create = await render(createElement(LendingApplicationCreatePage));
  await create.fill("Active product ID", "2"); await create.press("Cancel");
  await create.close();
  routing.params.productId = "2";
});

it("shows validation errors and failed transitions without losing the current page", async () => {
  lending.createProduct.mockRejectedValueOnce(new ApiError("Invalid product", 422, "invalid_body", { code: ["Taken"] }));
  const productCreate = await render(createElement(LendingProductCreatePage));
  await productCreate.press("Next step"); await productCreate.press("Next step"); await productCreate.press("Create product");
  await productCreate.press("Previous step"); await productCreate.press("Previous step");
  expect(productCreate.container.textContent).toContain("Taken"); await productCreate.close();
  lending.createApplication.mockRejectedValueOnce(new ApiError("Invalid application", 422, "invalid_body", { principal_minor: ["Too small"] }));
  const applicationCreate = await render(createElement(LendingApplicationCreatePage));
  await applicationCreate.press("Create draft");
  expect(applicationCreate.container.textContent).toContain("Too small"); await applicationCreate.close();
  lending.submitApplication.mockRejectedValueOnce(new ApiError("Conflict", 409, "server", { expected_version: ["Changed"] }));
  const applicationDetail = await render(createElement(LendingApplicationDetail));
  await applicationDetail.press("Submit");
  expect(applicationDetail.container.textContent).toContain("Conflict"); await applicationDetail.close();
  lending.decideReview.mockRejectedValueOnce(new ApiError("A note is required", 422, "invalid_body", { decision_note: ["Required"] }));
  const decision = await render(createElement(LendingReviewDecisionPage));
  await decision.press("Approve");
  expect(decision.container.textContent).toContain("Required"); await decision.close();
});

it("hides decisions for terminal review states and purpose for redacted applications", async () => {
  const { purpose: _purpose, ...redactedApplication } = application;
  lending.review.mockResolvedValueOnce({ application: { ...redactedApplication, status: "rejected" }, options: applicationOptions });
  const review = await render(createElement(LendingReviewDetail));
  expect(review.button("Decide")).toBeUndefined();
  expect(review.container.textContent).not.toContain("Purpose:"); await review.close();
  lending.review.mockResolvedValueOnce({ application: { ...application, status: "approved" }, options: applicationOptions });
  const decision = await render(createElement(LendingReviewDecisionPage));
  expect(decision.container.textContent).toContain("Only submitted"); await decision.close();
  lending.application.mockResolvedValueOnce({ application: { ...application, status: "withdrawn" }, options: applicationOptions });
  const withdrawn = await render(createElement(LendingApplicationDetail));
  expect(withdrawn.button("Withdraw")).toBeUndefined(); await withdrawn.close();
});

it("blocks a decision when a submitted review has no frozen terms", async () => {
  lending.review.mockResolvedValueOnce({ application: { ...application, status: "submitted", terms_snapshot: null }, options: applicationOptions });
  const decision = await render(createElement(LendingReviewDecisionPage));
  expect(decision.container.textContent).toContain("Submitted terms unavailable; decision disabled.");
  expect(decision.button("Approve")).toBeUndefined();
  expect(decision.button("Reject")).toBeUndefined();
  await decision.close();
});

it("handles a transport failure and absent status options without an invented choice", async () => {
  lending.submitApplication.mockRejectedValueOnce(new Error("Network unavailable"));
  const detail = await render(createElement(LendingApplicationDetail));
  await detail.press("Submit");
  expect(detail.container.textContent).toContain("Network unavailable"); await detail.close();
  lending.products.mockResolvedValueOnce({ data: [], meta: { ...meta, options: {} } });
  const productCreate = await render(createElement(LendingProductCreatePage));
  expect(productCreate.container.textContent).toContain("Create lending product");
  await productCreate.close();
  lending.products.mockImplementationOnce(() => new Promise(() => {}));
  function Probe() {
    const model = useLendingDirectory("7", "products");
    return createElement("button", { onClick: model.cycleStatus }, model.status || "All");
  }
  const probe = await render(createElement(Probe));
  await probe.press("All");
  expect(probe.container.textContent).toBe("All"); await probe.close();
});
