// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "../../packages/api-client";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const routing = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), params: { id: "7", pageId: "4" } }));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return { router: routing, useLocalSearchParams: () => routing.params,
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]) };
});
const page = { id: 4, slug: "home", title: "Home", blocks: [
  { type: "heading" as const, text: "Welcome", level: 1 },
  { type: "paragraph" as const, text: "Body" },
], status: "draft", version: 1, published_version: null as number | null, published_at: null as string | null };
const options = { status: { draft: "Draft", published: "Published" },
  block_type: { heading: "Heading", paragraph: "Paragraph", image: "Image", button: "Button" } };
const builder = {
  pages: vi.fn(async () => ({ data: [page], meta: { current_page: 1, per_page: 3, last_page: 2, total: 4, options } })),
  page: vi.fn(async () => ({ page, options })),
  createPage: vi.fn(async () => ({ page, options })),
  updatePage: vi.fn(async () => ({ page, options })),
  publishPage: vi.fn(async () => ({ page: { ...page, status: "published", version: 2, published_version: 2 }, options })),
  renderPage: vi.fn(async () => ({ render: { slug: "home", title: "Home", published_version: 2,
    blocks: [{ type: "heading", text: "Welcome", level: 1 }, { type: "paragraph", text: "Body" },
      { type: "image", src: "https://example.org/a", alt: "Cover" },
      { type: "button", label: "Visit", url: "https://example.org" }] } })),
};
const session = { api: { builder }, user: { id: 9 } as { id: number } | null };
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

import { BuilderCreatePage, BuilderDetail, BuilderDirectory, BuilderEditPage, BuilderPreview } from
  "../../frontend/admin/src/screens/platform_builder_screen";
import { BuilderForm } from "../../frontend/admin/src/screens/platform_builder_screen/interface/Form";
import { builderPath } from "../../frontend/admin/src/screens/platform_builder_screen/logic/model";

beforeEach(() => {
  vi.clearAllMocks();
  session.user = { id: 9 };
  builder.pages.mockResolvedValue({ data: [page], meta: { current_page: 1, per_page: 3, last_page: 2, total: 4, options } });
  builder.page.mockResolvedValue({ page, options });
  builder.renderPage.mockResolvedValue({ render: { slug: "home", title: "Home", published_version: 2,
    blocks: [{ type: "heading", text: "Welcome", level: 1 }, { type: "paragraph", text: "Body" },
      { type: "image", src: "https://example.org/a", alt: "Cover" },
      { type: "button", label: "Visit", url: "https://example.org" }] } });
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

it("lists two pages per screen with model labels, paging, status filter, and navigation", async () => {
  const view = await render(createElement(BuilderDirectory));
  expect(builder.pages).toHaveBeenCalledWith("7", 1, "", 2);
  await view.press("Status:");
  expect(builder.pages).toHaveBeenLastCalledWith("7", 1, "draft", 2);
  await view.press("Next");
  expect(builder.pages).toHaveBeenLastCalledWith("7", 2, "draft", 2);
  await view.press("Previous");
  await view.press("Home");
  expect(routing.push).toHaveBeenCalledWith(builderPath("7", 4));
  await view.press("Create page");
  expect(routing.push).toHaveBeenCalledWith(`${builderPath("7")}/create`);
  await view.press("Services");
  expect(routing.replace).toHaveBeenCalledWith("/platform/organizations/7/service-hub");
  expect(view.container.querySelectorAll("button").length).toBeLessThanOrEqual(7);
  await view.close();
});

it("uses one full-page form for create and edit and preserves non-text blocks", async () => {
  const create = await render(createElement(BuilderCreatePage));
  await create.fill("Slug", "home");
  await create.fill("Title", "Home");
  await create.fill("Heading", "Welcome");
  await create.fill("Body paragraph", "Body");
  await create.press("Create draft");
  expect(builder.createPage).toHaveBeenCalledWith("7", { slug: "home", title: "Home", blocks: page.blocks });
  expect(routing.replace).toHaveBeenCalledWith(builderPath("7", 4));
  await create.press("Cancel");
  expect(routing.replace).toHaveBeenCalledWith(builderPath("7", undefined));
  await create.close();

  const initial = { ...page, blocks: [...page.blocks, { type: "image" as const, src: "https://example.org/a", alt: "Cover" }] };
  const edit = await render(createElement(BuilderForm, { organizationId: "7", initial }));
  await edit.fill("Title", "New home");
  await edit.press("Save draft");
  expect(builder.updatePage).toHaveBeenCalledWith("7", 4, { title: "New home", blocks: initial.blocks, expected_version: 1 });
  await edit.press("Cancel");
  expect(routing.replace).toHaveBeenCalledWith(builderPath("7", 4));
  await edit.close();
  const editPage = await render(createElement(BuilderEditPage));
  expect(editPage.container.textContent).toContain("Edit Builder page");
  await editPage.close();
});

it("publishes by current version and reads only the safe rendered snapshot", async () => {
  const detail = await render(createElement(BuilderDetail));
  expect(detail.container.textContent).toContain("1 draft blocks".replace("1", "2"));
  await detail.press("Edit draft");
  expect(routing.push).toHaveBeenCalledWith(`${builderPath("7", 4)}/edit`);
  await detail.press("Publish");
  expect(builder.publishPage).toHaveBeenCalledWith("7", 4, { expected_version: 1 });
  await detail.press("Pages");
  expect(routing.replace).toHaveBeenCalledWith(builderPath("7"));
  await detail.close();

  const published = { ...page, status: "published", published_version: 2 };
  builder.page.mockResolvedValue({ page: published, options });
  const pubDetail = await render(createElement(BuilderDetail));
  expect(pubDetail.button("Publish").disabled).toBe(true);
  await pubDetail.press("Published preview");
  expect(routing.push).toHaveBeenCalledWith(`${builderPath("7", 4)}/render`);
  await pubDetail.close();

  const preview = await render(createElement(BuilderPreview));
  expect(preview.container.textContent).toContain("Welcome");
  expect(preview.container.textContent).toContain("Image: Cover (https://example.org/a)");
  expect(preview.container.textContent).toContain("Visit: https://example.org");
  expect(preview.container.querySelector("script")).toBeNull();
  await preview.press("Page");
  expect(routing.replace).toHaveBeenCalledWith(builderPath("7", "4"));
  await preview.close();
});

it("shows errors, retries, and denies work without a platform session", async () => {
  builder.pages.mockRejectedValueOnce(new Error("Temporary outage"));
  const list = await render(createElement(BuilderDirectory));
  expect(list.container.textContent).toContain("Temporary outage");
  await list.press("Retry");
  expect(list.container.textContent).toContain("Home");
  await list.close();

  builder.page.mockRejectedValueOnce(new Error("Temporary outage"));
  const detail = await render(createElement(BuilderDetail));
  await detail.press("Retry");
  expect(detail.container.textContent).toContain("Home");
  await detail.close();

  builder.createPage.mockRejectedValueOnce(new ApiError("Invalid", 422, "validation", { title: ["Required"] }));
  const form = await render(createElement(BuilderForm, { organizationId: "7" }));
  await form.press("Create draft");
  expect(form.container.textContent).toContain("Required");
  await form.close();

  builder.renderPage.mockRejectedValueOnce(new Error("Temporary outage"));
  const preview = await render(createElement(BuilderPreview));
  await preview.press("Retry");
  expect(preview.container.textContent).toContain("Welcome");
  await preview.close();

  session.user = null;
  for (const component of [BuilderDirectory, BuilderCreatePage, BuilderEditPage, BuilderDetail, BuilderPreview]) {
    const guest = await render(createElement(component));
    expect(guest.container.textContent).toContain("Sign in");
    if (component === BuilderDirectory) await guest.press("Sign in");
    await guest.close();
  }
  expect(routing.replace).toHaveBeenCalledWith("/platform/login");
});

it("handles empty filters, missing edit records, publish errors, and generic form failure", async () => {
  builder.pages.mockResolvedValueOnce({ data: [], meta: { current_page: 1, per_page: 3,
    last_page: 1, total: 0, options: { ...options, status: {} } } });
  const list = await render(createElement(BuilderDirectory));
  expect(list.container.textContent).toContain("No pages on this page");
  await list.press("Status:");
  expect(builder.pages).toHaveBeenLastCalledWith("7", 1, "", 2);
  await list.close();

  const filtered = await render(createElement(BuilderDirectory));
  builder.pages.mockResolvedValueOnce({ data: [page], meta: { current_page: 1, per_page: 3,
    last_page: 1, total: 1, options: { ...options, status: {} } } });
  await filtered.press("Status:");
  expect(filtered.container.textContent).toContain("Unavailable");
  await filtered.close();

  builder.page.mockRejectedValueOnce(new Error("Edit unavailable"));
  const edit = await render(createElement(BuilderEditPage));
  expect(edit.container.textContent).toContain("Edit unavailable");
  await edit.press("Retry");
  expect(edit.container.textContent).toContain("Slug: home");
  await edit.close();

  builder.publishPage.mockRejectedValueOnce(new ApiError("Stale", 422, "validation", {
    expected_version: ["Version changed"],
  }));
  const detail = await render(createElement(BuilderDetail));
  await detail.press("Publish");
  expect(detail.container.textContent).toContain("Version changed");
  await detail.close();

  builder.publishPage.mockRejectedValueOnce(new Error("Publish unavailable"));
  const again = await render(createElement(BuilderDetail));
  await again.press("Publish");
  expect(again.container.textContent).toContain("Publish unavailable");
  await again.close();

  builder.createPage.mockRejectedValueOnce(new Error("Save unavailable"));
  const form = await render(createElement(BuilderForm, { organizationId: "7" }));
  await form.press("Create draft");
  expect(form.container.textContent).toContain("Save unavailable");
  expect(builder.createPage).toHaveBeenLastCalledWith("7", { slug: "", title: "", blocks: [] });
  await form.close();
});
