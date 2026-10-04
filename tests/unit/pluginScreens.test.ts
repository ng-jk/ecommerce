// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "../../packages/api-client";
import { mountHook, deferred } from "./reactHarness";
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const params = vi.hoisted(() => ({ id: "5" }));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    router,
    useLocalSearchParams: () => params,
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]),
  };
});
vi.mock("@portfolio/storefront", () => ({
  useStore: () => state,
  Copy: ({ children }: { children: ReactNode }) =>
    createElement("span", {}, children),
  Panel: ({ children }: { children: ReactNode }) =>
    createElement("div", {}, children),
  Button: ({
    title,
    onPress,
    disabled,
  }: {
    title: string;
    onPress: () => void;
    disabled?: boolean;
  }) => createElement("button", { onClick: onPress, disabled }, title),
  Field: ({
    label,
    value,
    onChangeText,
  }: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
  }) =>
    createElement("input", {
      "aria-label": label,
      value,
      onInput: (event: React.FormEvent<HTMLInputElement>) =>
        onChangeText(event.currentTarget.value),
    }),
}));
vi.mock("../../frontend/admin/src/screens/admin_shell_screen", () => ({
  AdminPage: ({ children }: { children: ReactNode }) =>
    createElement("main", {}, children),
  useAdminShop: () => ({ shop: state.shop }),
}));
import { PluginCreateScreen } from "../../frontend/admin/src/screens/plugin_create_screen/interface/Create";
import { PluginEditScreen } from "../../frontend/admin/src/screens/plugin_edit_screen/interface/Edit";
import { PluginsListScreen } from "../../frontend/admin/src/screens/plugins_list_screen/interface/PluginsList";
import { PluginCreditScreen } from "../../frontend/admin/src/screens/plugin_credit_screen/interface/Credit";
import { usePluginCredit } from "../../frontend/admin/src/screens/plugin_credit_screen/logic/usePluginCredit";
import { usePluginForm } from "../../frontend/admin/src/screens/plugin_form_screen/logic/usePluginForm";

const plugin = {
  id: 5,
  plugin_id: "loyalty" as const,
  version: 2,
  enabled: true,
  customer_enabled: true,
  max_credit: 100,
  created_at: "now",
  updated_at: "now",
};
const plugins = {
  list: vi.fn(async (_page = 1, _enabled?: boolean) => ({
    plugins: {
      data: [plugin],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
    },
    options: { plugin_id: { loyalty: "Rewards" } as Record<string, string> },
  })),
  detail: vi.fn(async () => ({
    plugin,
    options: { plugin_id: { loyalty: "Rewards" } as Record<string, string> },
  })),
  install: vi.fn(async () => ({ plugin })),
  update: vi.fn(async () => ({ plugin })),
  credit: vi.fn(async () => ({ balance: { points: 55 } })),
};
const state = {
  shop: "fashion",
  user: { id: 3, role: "admin" } as { id: number; role: string } | null,
  busy: false,
  api: {
    assistant: vi.fn(async () => ({
      available_actions: [{ name: "creditLoyalty", allowed_roles: ["admin"] }],
    })),
  },
  plugins,
  run: async (callback: () => Promise<void>) => {
    try {
      await callback();
      return true;
    } catch {
      return false;
    }
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  plugins.list.mockImplementation(async () => ({
    plugins: {
      data: [plugin],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
    },
    options: { plugin_id: { loyalty: "Rewards" } },
  }));
  state.user = { id: 3, role: "admin" };
  state.shop = "fashion";
  params.id = "5";
});
async function render(element: React.ReactElement) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
    await Promise.resolve();
  });
  return {
    container,
    root,
    button: (name: string) =>
      Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes(name),
      )!,
    input: (label: string) =>
      container.querySelector<HTMLInputElement>(
        `input[aria-label="${label}"]`,
      )!,
  };
}
async function click(button: HTMLButtonElement) {
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
}
async function fill(input: HTMLInputElement, value: string) {
  await act(async () => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("shows model options and admin plugin navigation", async () => {
  const view = await render(createElement(PluginsListScreen));
  expect(view.container.textContent).toContain("Rewards");
  await click(view.button("Dashboard"));
  expect(router.replace).toHaveBeenCalledWith("/");
  await click(view.button("Configure"));
  expect(router.push).toHaveBeenCalledWith("/plugins/5/edit");
  await click(view.button("Credit customer"));
  expect(router.push).toHaveBeenCalledWith("/plugins/credit");
  await click(view.button("Enabled only"));
  expect(plugins.list).toHaveBeenCalledWith(1, true);
  view.root.unmount();
});
it("offers install and pages an empty plugin list", async () => {
  plugins.list.mockImplementation(async (page) => ({
    plugins: {
      data: [],
      meta: { current_page: page ?? 1, last_page: 3, per_page: 1, total: 3 },
    },
    options: { plugin_id: { loyalty: "Rewards" } },
  }));
  const view = await render(createElement(PluginsListScreen));
  expect(view.container.textContent).toContain("No plugins on this page");
  await click(view.button("Install Rewards"));
  expect(router.push).toHaveBeenCalledWith("/plugins/create");
  await click(view.button("Next"));
  expect(plugins.list).toHaveBeenCalledWith(2, undefined);
  await click(view.button("Previous"));
  expect(plugins.list).toHaveBeenCalledWith(1, undefined);
  view.root.unmount();
});
it("keeps an enabled filter from offering a duplicate install", async () => {
  const view = await render(createElement(PluginsListScreen));
  await click(view.button("Enabled only"));
  expect(view.button("Install").disabled).toBe(true);
  view.root.unmount();
});
it("shows an access message to guests without loading merchant plugins", async () => {
  state.user = null;
  const view = await render(createElement(PluginsListScreen));
  expect(view.container.textContent).toContain("Administrator access required");
  expect(plugins.list).not.toHaveBeenCalled();
  view.root.unmount();
});
it("renders unknown option labels and disabled plugin state safely", async () => {
  plugins.list.mockImplementationOnce(async () => ({
    plugins: {
      data: [{ ...plugin, enabled: false, customer_enabled: false }],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
    },
    options: { plugin_id: {} },
  }));
  const view = await render(createElement(PluginsListScreen));
  expect(view.container.textContent).toContain(
    "loyalty · Disabled · Customer access off",
  );
  expect(view.container.textContent).not.toContain("Credit customer");
  expect(view.button("Configure loyalty")).toBeDefined();
  view.root.unmount();
});
it("discards a list result after leaving the plugin list", async () => {
  const pending = deferred<Awaited<ReturnType<typeof plugins.list>>>();
  plugins.list.mockImplementationOnce(() => pending.promise);
  const view = await render(createElement(PluginsListScreen));
  await act(async () => {
    view.root.unmount();
  });
  await act(async () => {
    pending.resolve({
      plugins: {
        data: [plugin],
        meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
      },
      options: { plugin_id: { loyalty: "Rewards" } },
    });
    await Promise.resolve();
  });
});
it("uses a standalone shared form for create and edit with server version", async () => {
  const create = await render(createElement(PluginCreateScreen));
  expect(create.container.textContent).toContain("Rewards");
  await click(create.button("Install plugin"));
  expect(plugins.install).toHaveBeenCalledWith(3, {
    enabled: false,
    customer_enabled: false,
    max_credit: 100,
  });
  create.root.unmount();
  const edit = await render(createElement(PluginEditScreen));
  expect(edit.container.textContent).toContain("Rewards");
  await click(edit.button("Merchant enabled"));
  await click(edit.button("Save changes"));
  expect(plugins.update).toHaveBeenCalledWith(3, 5, 2, {
    enabled: false,
    customer_enabled: true,
    max_credit: 100,
  });
  edit.root.unmount();
});
it("prevents stale edit content when the route changes", async () => {
  const view = await render(createElement(PluginEditScreen));
  expect(view.container.textContent).toContain("Rewards");
  params.id = "8";
  plugins.detail.mockImplementationOnce(
    async () =>
      await new Promise<Awaited<ReturnType<typeof plugins.detail>>>(() => {}),
  );
  await act(async () => {
    view.root.render(createElement(PluginEditScreen));
    await Promise.resolve();
  });
  expect(view.container.textContent).toContain("Loading plugin");
  view.root.unmount();
});
it("shows credit only after discovery and sends an authorized principal", async () => {
  const view = await render(createElement(PluginCreditScreen));
  await click(view.button("Plugins"));
  expect(router.replace).toHaveBeenCalledWith("/plugins");
  expect(view.input("Customer ID")).not.toBeNull();
  await fill(view.input("Customer ID"), "9");
  await fill(view.input("Points"), "10");
  await fill(view.input("Reason"), "Correction");
  await click(view.button("Credit points"));
  expect(plugins.credit).toHaveBeenCalledWith(3, 9, 10, "Correction");
  expect(view.container.textContent).toContain("55 points");
  view.root.unmount();
});
it("clears credit form and balance when the admin principal changes", async () => {
  const view = await render(createElement(PluginCreditScreen));
  await fill(view.input("Customer ID"), "9");
  await fill(view.input("Points"), "10");
  await fill(view.input("Reason"), "Correction");
  await click(view.button("Credit points"));
  expect(view.container.textContent).toContain("55 points");
  state.user = { id: 12, role: "admin" };
  await act(async () => {
    view.root.render(createElement(PluginCreditScreen));
    await Promise.resolve();
  });
  expect(view.container.textContent).not.toContain("55 points");
  expect(view.input("Customer ID").value).toBe("");
  view.root.unmount();
});
it("hides admin pages for non-admins and invalid edit routes", async () => {
  state.user = null;
  const create = await render(createElement(PluginCreateScreen));
  expect(create.container.textContent).toContain(
    "Administrator access required",
  );
  create.root.unmount();
  const edit = await render(createElement(PluginEditScreen));
  expect(edit.container.textContent).toContain("Administrator access required");
  edit.root.unmount();
  const credit = await render(createElement(PluginCreditScreen));
  expect(credit.container.textContent).toContain("unavailable");
  credit.root.unmount();
  state.user = { id: 3, role: "admin" };
  params.id = "bad";
  const invalid = await render(createElement(PluginEditScreen));
  expect(invalid.container.textContent).toContain("Loading plugin");
  expect(plugins.detail).not.toHaveBeenCalled();
  invalid.root.unmount();
});
it("keeps the form unavailable when model options have no plugin label", async () => {
  plugins.list.mockImplementationOnce(async () => ({
    plugins: {
      data: [],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 },
    },
    options: { plugin_id: {} },
  }));
  const view = await render(createElement(PluginCreateScreen));
  expect(view.container.textContent).toContain("Loading plugin options");
  view.root.unmount();
});
it("shows local and server field validation beside the shared form", async () => {
  const view = await render(createElement(PluginCreateScreen));
  await fill(view.input("Maximum points per credit"), "0");
  await click(view.button("Install plugin"));
  expect(view.container.textContent).toContain(
    "Maximum credit must be a whole number",
  );
  plugins.install.mockRejectedValueOnce(
    new ApiError("Invalid", 422, "validation", { max_credit: ["Too high"] }),
  );
  await fill(view.input("Maximum points per credit"), "100");
  await click(view.button("Install plugin"));
  expect(view.container.textContent).toContain("Too high");
  view.root.unmount();
});
it("renders all server field errors and form controls", async () => {
  plugins.install.mockRejectedValueOnce(
    new ApiError("Invalid", 422, "validation", {
      enabled: ["Enable choice invalid"],
      customer_enabled: ["Customer choice invalid"],
      plugin_id: ["Plugin exists"],
      expected_version: ["Version changed"],
    }),
  );
  const view = await render(createElement(PluginCreateScreen));
  await click(view.button("Merchant enabled"));
  await click(view.button("Customer access"));
  await click(view.button("Install plugin"));
  for (const message of [
    "Enable choice invalid",
    "Customer choice invalid",
    "Plugin exists",
    "Version changed",
  ])
    expect(view.container.textContent).toContain(message);
  await click(view.button("Cancel"));
  expect(router.replace).toHaveBeenCalledWith("/plugins");
  view.root.unmount();
});
it("handles unavailable credit discovery and rejects invalid credit input", async () => {
  state.api.assistant.mockRejectedValueOnce(new Error("offline"));
  const failed = await render(createElement(PluginCreditScreen));
  expect(failed.container.textContent).toContain("unavailable");
  failed.root.unmount();
  const view = await render(createElement(PluginCreditScreen));
  await click(view.button("Credit points"));
  expect(plugins.credit).not.toHaveBeenCalled();
  view.root.unmount();
});
it("guards a valid credit draft when authority changes before submission", async () => {
  const hook = await mountHook(usePluginCredit);
  await act(async () => {
    hook.value.setUserId("9");
    hook.value.setPoints("10");
    hook.value.setReason("Correction");
  });
  state.user = null;
  await hook.rerender();
  await act(async () => {
    await hook.value.submit();
  });
  expect(plugins.credit).not.toHaveBeenCalled();
  await hook.unmount();
});
it("guards plugin installation when authority changes before submission", async () => {
  const hook = await mountHook(() => usePluginForm());
  state.user = null;
  await hook.rerender();
  await act(async () => {
    await hook.value.save();
  });
  expect(plugins.install).not.toHaveBeenCalled();
  await hook.unmount();
});
it("uses the plugin id when model options omit its label and drops late detail", async () => {
  plugins.detail.mockImplementationOnce(async () => ({
    plugin,
    options: { plugin_id: {} },
  }));
  const fallback = await render(createElement(PluginEditScreen));
  expect(fallback.container.textContent).toContain("Plugin: loyalty");
  fallback.root.unmount();
  const pending = deferred<Awaited<ReturnType<typeof plugins.detail>>>();
  plugins.detail.mockImplementationOnce(() => pending.promise);
  const view = await render(createElement(PluginEditScreen));
  await act(async () => {
    view.root.unmount();
  });
  await act(async () => {
    pending.resolve({ plugin, options: { plugin_id: { loyalty: "Rewards" } } });
    await Promise.resolve();
  });
});
it("ignores credit discovery that resolves or rejects after leaving", async () => {
  const success = deferred<{
    available_actions: { name: string; allowed_roles: string[] }[];
  }>();
  state.api.assistant.mockImplementationOnce(() => success.promise);
  const first = await mountHook(usePluginCredit);
  await first.unmount();
  await act(async () => {
    success.resolve({
      available_actions: [{ name: "creditLoyalty", allowed_roles: ["admin"] }],
    });
    await Promise.resolve();
  });
  const failure = deferred<{
    available_actions: { name: string; allowed_roles: string[] }[];
  }>();
  state.api.assistant.mockImplementationOnce(() => failure.promise);
  const second = await mountHook(usePluginCredit);
  await second.unmount();
  await act(async () => {
    failure.reject(new Error("offline"));
    await Promise.resolve();
  });
});
