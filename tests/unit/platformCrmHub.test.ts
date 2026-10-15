// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const routing = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("expo-router", () => ({ router: routing, useLocalSearchParams: () => ({ id: "7" }) }));
vi.mock("../../frontend/admin/src/screens/platform_shell_screen", () => ({
  PlatformPage: ({ title, children }: { title: string; children: ReactNode }) =>
    createElement("main", {}, createElement("h1", {}, title), children),
  PlatformButton: ({ title, onPress }: { title: string; onPress(): void }) =>
    createElement("button", { onClick: onPress }, title),
}));

import CrmHub from "../../frontend/admin/src/app/platform/organizations/[id]/crm";

it("keeps the CRM hub within five controls and routes to the sales subhub", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(createElement(CrmHub)));
  const buttons = [...container.querySelectorAll("button")];
  expect(buttons.map(button => button.textContent)).toEqual(["Organization", "Companies", "Contacts", "Leads", "Sales"]);
  for (const button of buttons) await act(async () => button.click());
  expect(routing.replace).toHaveBeenCalledWith("/platform/organizations/7");
  expect(routing.push).toHaveBeenCalledWith("/platform/organizations/7/crm/sales");
  await act(async () => root.unmount());
});
