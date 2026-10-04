// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    router,
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]),
  };
});
vi.mock("../../packages/storefront/screens/store_shell_screen", () => ({
  useStore: () => store,
  Page: ({ children }: { children: ReactNode }) =>
    createElement("main", {}, children),
  Heading: ({ children }: { children: ReactNode }) =>
    createElement("h1", {}, children),
  Panel: ({ children }: { children: ReactNode }) =>
    createElement("section", {}, children),
  Copy: ({ children }: { children: ReactNode }) =>
    createElement("span", {}, children),
  Button: ({ title, onPress }: { title: string; onPress: () => void }) =>
    createElement("button", { onClick: onPress }, title),
}));
import { LoyaltyScreen } from "../../packages/storefront/screens/loyalty_screen/interface/LoyaltyScreen";
import { MenuScreen } from "../../packages/storefront/screens/menu_screen/interface/MenuScreen";
const tool = { name: "loyaltyBalance", allowed_roles: ["customer"] };
const store = {
  shop: "fashion",
  user: { id: 4, role: "customer" } as { id: number; role: string } | null,
  api: {
    assistant: vi.fn(async () => ({ available_actions: [tool] })) as
      | ((
          turn: unknown,
          id: number,
        ) => Promise<{ available_actions: (typeof tool)[] }>)
      | undefined,
  },
  plugins: { balance: vi.fn(async () => ({ balance: { points: 60 } })) },
};
beforeEach(() => {
  vi.clearAllMocks();
  store.user = { id: 4, role: "customer" };
  store.api.assistant = vi.fn(async () => ({ available_actions: [tool] }));
  store.plugins.balance = vi.fn(async () => ({ balance: { points: 60 } }));
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
  };
}
it("discovers loyalty per signed in customer and shows balance", async () => {
  const menu = await render(createElement(MenuScreen));
  expect(menu.container.textContent).toContain("Loyalty points");
  await act(async () => {
    menu.button("Loyalty points").click();
  });
  expect(router.push).toHaveBeenCalledWith("/loyalty");
  menu.root.unmount();
  const balance = await render(createElement(LoyaltyScreen));
  expect(balance.container.textContent).toContain("60 points");
  await act(async () => {
    balance.button("Account").click();
  });
  expect(router.replace).toHaveBeenCalledWith("/account");
  expect(store.plugins.balance).toHaveBeenCalledTimes(1);
  balance.root.unmount();
});
it("hides menu link and balance when discovery omits the tool", async () => {
  store.api.assistant = vi.fn(async () => ({ available_actions: [] }));
  const menu = await render(createElement(MenuScreen));
  expect(menu.container.textContent).not.toContain("Loyalty points");
  menu.root.unmount();
  const balance = await render(createElement(LoyaltyScreen));
  expect(balance.container.textContent).toContain("unavailable");
  expect(store.plugins.balance).not.toHaveBeenCalled();
  balance.root.unmount();
});
it("does not discover for guests", async () => {
  store.user = null;
  const menu = await render(createElement(MenuScreen));
  expect(menu.container.textContent).not.toContain("Loyalty points");
  menu.root.unmount();
  const balance = await render(createElement(LoyaltyScreen));
  expect(balance.container.textContent).toContain("unavailable");
  expect(store.api.assistant).not.toHaveBeenCalled();
  balance.root.unmount();
});
it("drops a discovered menu link immediately when the principal changes", async () => {
  const menu = await render(createElement(MenuScreen));
  expect(menu.container.textContent).toContain("Loyalty points");
  store.user = { id: 8, role: "customer" };
  store.api.assistant = vi.fn(
    async () =>
      await new Promise<{ available_actions: (typeof tool)[] }>(() => {}),
  );
  await act(async () => {
    menu.root.render(createElement(MenuScreen));
    await Promise.resolve();
  });
  expect(menu.container.textContent).not.toContain("Loyalty points");
  menu.root.unmount();
});
it("allows retry after a failed balance request", async () => {
  store.plugins.balance = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ balance: { points: 10 } });
  const view = await render(createElement(LoyaltyScreen));
  expect(view.container.textContent).toContain("Could not load");
  await act(async () => {
    view.button("Retry").click();
    await Promise.resolve();
  });
  expect(view.container.textContent).toContain("10 points");
  view.root.unmount();
});
it("hides the menu link if discovery fails and handles a missing assistant", async () => {
  store.api.assistant = vi.fn(async () => {
    throw new Error("offline");
  });
  const menu = await render(createElement(MenuScreen));
  expect(menu.container.textContent).not.toContain("Loyalty points");
  menu.root.unmount();
  store.api.assistant = undefined;
  const view = await render(createElement(LoyaltyScreen));
  expect(view.container.textContent).toContain("unavailable");
  view.root.unmount();
});
it("discards an obsolete balance response after leaving the screen", async () => {
  let complete: ((value: { balance: { points: number } }) => void) | undefined;
  store.plugins.balance = vi.fn(
    async () =>
      await new Promise<{ balance: { points: number } }>((resolve) => {
        complete = resolve;
      }),
  );
  const view = await render(createElement(LoyaltyScreen));
  expect(view.container.textContent).toContain("Loading your balance");
  await act(async () => {
    view.root.unmount();
  });
  await act(async () => {
    complete?.({ balance: { points: 88 } });
    await Promise.resolve();
  });
});
it("ignores discovery that completes after the loyalty screen leaves", async () => {
  let complete:
    ((value: { available_actions: (typeof tool)[] }) => void) | undefined;
  store.api.assistant = vi.fn(
    async () =>
      await new Promise<{ available_actions: (typeof tool)[] }>((resolve) => {
        complete = resolve;
      }),
  );
  const view = await render(createElement(LoyaltyScreen));
  await act(async () => {
    view.root.unmount();
  });
  await act(async () => {
    complete?.({ available_actions: [tool] });
    await Promise.resolve();
  });
  expect(store.plugins.balance).not.toHaveBeenCalled();
});
it("ignores a late balance failure and menu discovery after leaving", async () => {
  let failBalance: ((error: Error) => void) | undefined;
  store.plugins.balance = vi.fn(
    async () =>
      await new Promise<{ balance: { points: number } }>((_, reject) => {
        failBalance = reject;
      }),
  );
  const balance = await render(createElement(LoyaltyScreen));
  await act(async () => {
    balance.root.unmount();
  });
  await act(async () => {
    failBalance?.(new Error("offline"));
    await Promise.resolve();
  });
  let complete:
    ((value: { available_actions: (typeof tool)[] }) => void) | undefined;
  store.api.assistant = vi.fn(
    async () =>
      await new Promise<{ available_actions: (typeof tool)[] }>((resolve) => {
        complete = resolve;
      }),
  );
  const menu = await render(createElement(MenuScreen));
  await act(async () => {
    menu.root.unmount();
  });
  await act(async () => {
    complete?.({ available_actions: [tool] });
    await Promise.resolve();
  });
});
it("ignores a late menu discovery failure after leaving", async () => {
  let fail: ((error: Error) => void) | undefined;
  store.api.assistant = vi.fn(
    async () =>
      await new Promise<{ available_actions: (typeof tool)[] }>((_, reject) => {
        fail = reject;
      }),
  );
  const menu = await render(createElement(MenuScreen));
  await act(async () => {
    menu.root.unmount();
  });
  await act(async () => {
    fail?.(new Error("offline"));
    await Promise.resolve();
  });
});
