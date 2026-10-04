// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import type { useAssistant } from "../../packages/storefront/screens/assistant_screen/logic/useAssistant";
import type { AssistantReply } from "../../packages/api-client/services/assistant/logic/types";
const scope = vi.hoisted(() => ({
  shop: "fashion",
  user: { id: 1, role: "customer" } as { id: number; role: string } | null,
}));
vi.mock(
  "../../packages/storefront/screens/assistant_screen/logic/useAssistant",
  () => ({ useAssistant: () => model }),
);
vi.mock("../../packages/storefront/screens/store_shell_screen", () => ({
  useStore: () => scope,
  Page: ({
    children,
    navigationTitle,
  }: {
    children: ReactNode;
    navigationTitle: string;
  }) => createElement("main", { "data-navigation": navigationTitle }, children),
  Heading: ({ children }: { children: ReactNode }) =>
    createElement("h1", {}, children),
  Copy: ({ children }: { children: ReactNode }) =>
    createElement("p", {}, children),
  Panel: ({ children }: { children: ReactNode }) =>
    createElement("section", {}, children),
  Button: ({
    title,
    disabled,
    onPress,
  }: {
    title: string;
    disabled?: boolean;
    onPress: () => void;
  }) => createElement("button", { disabled, onClick: onPress }, title),
  Field: ({
    label,
    value,
    secureTextEntry,
    keyboardType,
    multiline,
    onChangeText,
  }: {
    label: string;
    value: string;
    secureTextEntry: boolean;
    keyboardType: string;
    multiline: boolean;
    onChangeText: (value: string) => void;
  }) =>
    createElement("input", {
      "aria-label": label,
      value,
      type: secureTextEntry ? "password" : "text",
      "data-keyboard": keyboardType,
      "data-multiline": multiline,
      onInput: (event: React.FormEvent<HTMLInputElement>) =>
        onChangeText(event.currentTarget.value),
    }),
}));
vi.mock("@portfolio/storefront", () => ({ AssistantScreen }));
vi.mock("expo-router", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));
import { AssistantScreen } from "../../packages/storefront/screens/assistant_screen/interface/AssistantScreen";
import AdminAssistant from "../../frontend/admin/src/app/assistant";
const reply: AssistantReply = {
  status: "needs_input",
  message: "Choose an action",
  required_input: [],
  available_actions: [],
};
let model: ReturnType<typeof useAssistant>;
beforeEach(() => {
  scope.user = { id: 1, role: "customer" };
  model = {
    reply: null,
    message: "",
    setMessage: vi.fn(),
    value: "",
    setValue: vi.fn(),
    field: undefined,
    error: "",
    busy: false,
    pending: null,
    discover: vi.fn(async () => {}),
    choose: vi.fn(async () => {}),
    submit: vi.fn(async () => {}),
    confirm: vi.fn(async () => {}),
    retry: vi.fn(async () => {}),
    reset: vi.fn(),
  };
});
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
async function render(admin = false) {
  const container = document.createElement("div");
  const root = createRoot(container);
  const refresh = async () => {
    await act(async () => {
      root.render(createElement(admin ? AdminAssistant : AssistantScreen));
    });
  };
  await refresh();
  return {
    container,
    refresh,
    press: async (title: string) => {
      const button = [...container.querySelectorAll("button")].find(
        (element) => element.textContent === title,
      );
      expect(button, title).toBeTruthy();
      await act(async () => {
        button?.click();
      });
    },
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
    },
  };
}

it("offers discovery and natural-language input with authorized action selection", async () => {
  const screen = await render();
  expect(screen.container.querySelector("button")?.disabled).toBe(true);
  await screen.press("Discover available actions");
  expect(model.discover).toHaveBeenCalledOnce();
  model.message = "Find shirts";
  model.reply = {
    ...reply,
    available_actions: [
      {
        name: "catalog",
        description: "Search products",
        method: "GET",
        path: "/products",
        parameters: {},
        allowed_roles: ["guest"],
        confirmation_required: false,
        natural_language_confirmation_required: true,
      },
    ],
  };
  await screen.refresh();
  await screen.press("Send message");
  await screen.press("Search products");
  await screen.press("New request");
  expect(model.submit).toHaveBeenCalledOnce();
  expect(model.choose).toHaveBeenCalledWith("catalog");
  expect(model.reset).toHaveBeenCalledOnce();
  const input = screen.container.querySelector("input")!;
  await act(async () => {
    input.value = "New text";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(model.setMessage).toHaveBeenCalledWith("New text");
  await screen.unmount();
});

it("uses secure typed fields, numeric controls, and declared options", async () => {
  const screen = await render();
  model.reply = { ...reply, conversation_id: "conversation" };
  for (const type of ["string", "integer", "number", "array", "object"]) {
    model.field = {
      field: type === "string" ? "data.password" : "data.value",
      type,
    };
    model.value = type === "array" ? "[]" : "1";
    await screen.refresh();
    expect(screen.container.querySelector("input")?.type).toBe(
      type === "string" ? "password" : "text",
    );
    await screen.press("Provide this detail");
    const input = screen.container.querySelector("input")!;
    await act(async () => {
      input.value = "2";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(model.setValue).toHaveBeenLastCalledWith("2");
  }
  model.field = { field: "data.active", type: "boolean" };
  model.value = "";
  await screen.refresh();
  await screen.press("data.active: Choose an option");
  expect(model.setValue).toHaveBeenLastCalledWith("false");
  model.field = { field: "data.country", type: "string", enum: ["MY", "SG"] };
  model.value = "MY";
  await screen.refresh();
  await screen.press("data.country: MY");
  expect(model.setValue).toHaveBeenLastCalledWith("SG");
  model.field = {
    field: "data.status",
    type: "string",
    enum: ["placed"],
    options: { placed: "Placed" },
  };
  model.value = "placed";
  await screen.refresh();
  await screen.press("data.status: Placed");
  model.value = "unsupported";
  await screen.refresh();
  expect(screen.container.textContent).toContain("Unavailable option");
  model.value = "";
  model.field = { field: "data.value", type: "string" };
  await screen.refresh();
  expect(
    [...screen.container.querySelectorAll("button")].find(
      (button) => button.textContent === "Provide this detail",
    )?.disabled,
  ).toBe(true);
  await screen.unmount();
});

it("renders preview, pending retry, confirmation and completed results distinctly", async () => {
  const screen = await render(true);
  expect(
    screen.container.querySelector("main")?.getAttribute("data-navigation"),
  ).toBe("Dashboard");
  model.busy = true;
  await screen.refresh();
  expect(screen.container.textContent).toContain("Pending:");
  model.busy = false;
  model.pending = { message: "Find shirts" };
  model.error = "Still pending";
  await screen.refresh();
  await screen.press("Retry the same turn");
  expect(model.retry).toHaveBeenCalledOnce();
  model.pending = null;
  model.reply = {
    ...reply,
    status: "needs_confirmation",
    conversation_id: "conversation",
    preview: { total_sen: 100, input: { password: "secret" } },
    choices: [{ name: "Shirt" }],
  };
  await screen.refresh();
  await screen.press("Confirm reviewed action");
  expect(model.confirm).toHaveBeenCalledOnce();
  expect(screen.container.textContent).toContain("total_sen: 100");
  expect(screen.container.textContent).not.toContain("secret");
  model.reply = {
    ...reply,
    status: "completed",
    api_result: { order: { id: 2 } },
  };
  await screen.refresh();
  expect(screen.container.textContent).toContain("Order #2");
  scope.user = null;
  await screen.refresh();
  await screen.unmount();
});

it("identifies the selected read action before confirmation even when its preview contains no input", async () => {
  model.reply = {
    ...reply,
    status: "needs_confirmation",
    conversation_id: "conversation",
    message:
      "Review the action and data, then send confirm: true with this conversation version.",
    preview: { input: [], id: null, quote: [], total_sen: null },
    available_actions: [
      {
        name: "catalog",
        description: "Search or list products in the shop",
        method: "GET",
        path: "/products",
        parameters: {},
        allowed_roles: ["guest"],
        confirmation_required: false,
        natural_language_confirmation_required: true,
      },
    ],
  };
  const screen = await render();
  expect(screen.container.textContent).toContain(
    "Search or list products in the shop",
  );
  expect(screen.container.textContent).toContain("Action: catalog");
  expect(screen.container.textContent).toContain(
    "Review this action and its details. Confirm below to continue.",
  );
  expect(screen.container.textContent).not.toContain("confirm: true");
  await screen.press("Confirm reviewed action");
  expect(model.confirm).toHaveBeenCalledOnce();
  model.reply = {
    ...reply,
    status: "completed",
    api_result: {
      products: {
        data: [
          {
            id: 7,
            name: "Wireless headphones",
            price: 18900,
            stock: 10,
            shop_id: 2,
            version: 3,
            created_at: "internal-date",
          },
        ],
        meta: { total: 1 },
      },
    },
  };
  await screen.refresh();
  expect(screen.container.textContent).toContain(
    "Wireless headphones #7 — RM 189.00 · Stock: 10",
  );
  expect(screen.container.textContent).not.toContain("shop_id");
  expect(screen.container.textContent).not.toContain("internal-date");
  await screen.unmount();
});

it("renders a secure payment action for completed order results and rejects arbitrary external links", async () => {
  const safe = "https://checkout.stripe.com/c/pay/cs_test_123";
  model.reply = {
    ...reply,
    status: "completed",
    api_result: {
      orders: {
        data: [
          { id: 9, total: 100, payment: { checkout_url: safe } },
          {
            id: 10,
            total: 100,
            payment: { checkout_url: "https://evil.test/pay" },
          },
        ],
      },
    },
  };
  const screen = await render();
  expect(
    [...screen.container.querySelectorAll("a")].map((link) => [
      link.textContent,
      link.getAttribute("href"),
    ]),
  ).toEqual([["Pay securely #9", safe]]);
  await screen.unmount();
});
