// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const routing = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  params: { id: "7", offeringId: "2", purchaseId: "3" },
}));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    router: routing,
    useLocalSearchParams: () => routing.params,
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]),
  };
});
const offering = {
  id: 2,
  product_id: 4,
  application_key: "crm",
  version: 1,
  unit_amount: 1000,
  currency: "MYR",
  deliverables: ["CRM access"],
  published_at: "2026-10-15",
};
const purchase = {
  id: 3,
  order_id: 5,
  offering_id: 2,
  quoted_total: 1800,
  currency: "MYR",
  status: "failed",
};
const options = {
  awaiting_settlement: "Awaiting settlement",
  queued: "Queued",
  failed: "Failed",
};
const meta = {
  current_page: 1,
  last_page: 2,
  total: 2,
  per_page: 1,
  options: { status: options },
};
const solutions = {
  offerings: vi.fn(async () => ({ data: [offering], meta })),
  offering: vi.fn(async () => ({ offering })),
  publish: vi.fn(async () => ({ offering: { ...offering, id: 8 } })),
  purchases: vi.fn(async () => ({ data: [purchase], meta })),
  purchase: vi.fn(async () => ({
    purchase_id: 3,
    status: "failed",
    attempts: 12,
    options: { status: options },
  })),
  bind: vi.fn(async () => ({ purchase_id: 3 })),
  retry: vi.fn(async () => ({ purchase_id: 3, status: "queued" })),
};
const store = {
  api: { solutions },
  user: { id: 1, role: "admin" } as { id: number; role: string } | null,
  shop: "solutions",
  busy: false,
  run: async (task: () => Promise<void>) => {
    try {
      await task();
      return true;
    } catch {
      return false;
    }
  },
};
const defaultRun = store.run;
const platform = {
  api: { solutions },
  user: { id: 1 } as { id: number } | null,
};
vi.mock("@portfolio/storefront", () => ({
  useStore: () => store,
  Button: ({
    title,
    onPress,
    disabled,
  }: {
    title: string;
    onPress(): void;
    disabled?: boolean;
  }) => createElement("button", { onClick: onPress, disabled }, title),
  Copy: ({ children }: { children: ReactNode }) =>
    createElement("p", {}, children),
  Panel: ({ children }: { children: ReactNode }) =>
    createElement("section", {}, children),
  Field: ({
    label,
    value,
    multiline,
    onChangeText,
  }: {
    label: string;
    value: string;
    multiline?: boolean;
    onChangeText(value: string): void;
  }) =>
    createElement(multiline ? "textarea" : "input", {
      "aria-label": label,
      value,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        onChangeText(event.currentTarget.value),
    }),
}));
vi.mock("../../frontend/admin/src/screens/admin_shell_screen", () => ({
  AdminPage: ({ title, children }: { title: string; children: ReactNode }) =>
    createElement("main", {}, createElement("h1", {}, title), children),
}));
vi.mock("../../frontend/admin/src/screens/platform_shell_screen", () => ({
  usePlatformSession: () => platform,
  PlatformPage: ({ title, children }: { title: string; children: ReactNode }) =>
    createElement("main", {}, createElement("h1", {}, title), children),
  PlatformText: ({ children }: { children: ReactNode }) =>
    createElement("p", {}, children),
  PlatformButton: ({
    title,
    onPress,
    disabled,
  }: {
    title: string;
    onPress(): void;
    disabled?: boolean;
  }) => createElement("button", { onClick: onPress, disabled }, title),
}));

import {
  SolutionOfferings,
  SolutionOffering,
  PublishSolutionOffering,
  SolutionPurchases,
  SolutionPurchase,
  BindSolutionPurchase,
} from "../../frontend/admin/src/screens/solution_commerce_screen";
import {
  PlatformSolutionPurchases,
  PlatformSolutionPurchase,
} from "../../frontend/admin/src/screens/platform_solution_screen";

beforeEach(() => {
  vi.clearAllMocks();
  store.user = { id: 1, role: "admin" };
  store.run = defaultRun;
  platform.user = { id: 1 };
  solutions.offerings.mockResolvedValue({ data: [offering], meta });
  solutions.offering.mockResolvedValue({ offering });
  solutions.purchases.mockResolvedValue({ data: [purchase], meta });
  solutions.purchase.mockResolvedValue({
    purchase_id: 3,
    status: "failed",
    attempts: 12,
    options: { status: options },
  });
  solutions.publish.mockResolvedValue({ offering: { ...offering, id: 8 } });
  solutions.bind.mockResolvedValue({ purchase_id: 3 });
  solutions.retry.mockResolvedValue({ purchase_id: 3, status: "queued" });
});

async function render(element: React.ReactElement) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    container,
    button(label: string) {
      return [...container.querySelectorAll("button")].find((item) =>
        item.textContent?.includes(label),
      )!;
    },
    async press(label: string) {
      await act(async () => {
        this.button(label).click();
      });
    },
    async fill(label: string, value: string) {
      const input = container.querySelector<
        HTMLInputElement | HTMLTextAreaElement
      >(`[aria-label="${label}"]`)!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          input instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype,
          "value",
        )?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    },
    async close() {
      await act(async () => root.unmount());
    },
  };
}

it("shows published offerings, navigates pages, and publishes a fixed version", async () => {
  const list = await render(createElement(SolutionOfferings));
  expect(list.container.textContent).toContain("crm · version 1");
  await list.press("Publish offering");
  await list.press("View offering 2");
  await list.press("Next page");
  expect(solutions.offerings).toHaveBeenLastCalledWith(2);
  await list.press("Previous page");
  await list.press("Dashboard");
  await list.close();
  const detail = await render(createElement(SolutionOffering));
  expect(detail.container.textContent).toContain("CRM access");
  await detail.press("Organizations");
  await detail.press("Solutions");
  await detail.close();
  const form = await render(createElement(PublishSolutionOffering));
  await form.fill("Product ID", "4");
  await form.fill("Application key", "crm");
  await form.fill("Deliverables, one per line", "CRM access\n\nSetup");
  await form.press("Publish");
  expect(solutions.publish).toHaveBeenCalledWith({
    product_id: 4,
    application_key: "crm",
    deliverables: ["CRM access", "Setup"],
  });
  expect(routing.replace).toHaveBeenCalledWith("/solutions/offerings/8");
  await form.press("Cancel");
  await form.close();
});

it("binds an owned order and shows shop purchase and retry status", async () => {
  const list = await render(createElement(SolutionPurchases));
  expect(list.container.textContent).toContain("Order 5");
  await list.press("Bind an order");
  await list.press("View purchase 3");
  await list.press("Next page");
  expect(solutions.purchases).toHaveBeenLastCalledWith("7", 2);
  await list.press("Previous page");
  await list.press("Organization");
  await list.close();
  const form = await render(createElement(BindSolutionPurchase));
  await form.fill("Offering ID", "2");
  await form.fill("Order ID", "5");
  await form.press("Bind order");
  expect(solutions.bind).toHaveBeenCalledWith("7", {
    offering_id: 2,
    order_id: 5,
  });
  expect(routing.replace).toHaveBeenCalledWith(
    "/organizations/7/solution-purchases/3",
  );
  await form.press("Cancel");
  await form.close();
  const detail = await render(createElement(SolutionPurchase));
  expect(detail.container.textContent).toContain("Provisioning attempts: 12");
  await detail.press("Retry provisioning");
  expect(solutions.retry).toHaveBeenCalledWith("7", "3");
  await detail.press("Refresh status");
  await detail.press("Purchases");
  await detail.close();
});

it("lets a standalone organization owner inspect and retry provisioning", async () => {
  const list = await render(createElement(PlatformSolutionPurchases));
  expect(list.container.textContent).toContain("Purchase 3");
  await list.press("Purchase 3");
  await list.press("Next page");
  expect(solutions.purchases).toHaveBeenLastCalledWith("7", 2);
  await list.press("Previous page");
  await list.press("Organization");
  await list.close();
  const detail = await render(createElement(PlatformSolutionPurchase));
  await detail.press("Retry provisioning");
  expect(solutions.retry).toHaveBeenCalledWith("7", "3");
  await detail.press("Refresh status");
  await detail.press("Purchases");
  await detail.close();
});

it("keeps unauthenticated users away from purchase data", async () => {
  store.user = null;
  platform.user = null;
  const shop = await render(createElement(SolutionPurchases));
  expect(shop.container.textContent).toContain("Sign in");
  await shop.close();
  const shopDetail = await render(createElement(SolutionPurchase));
  expect(shopDetail.container.textContent).toContain("Sign in");
  await shopDetail.close();
  const standalone = await render(createElement(PlatformSolutionPurchases));
  await standalone.press("Sign in");
  await standalone.close();
  const standaloneDetail = await render(
    createElement(PlatformSolutionPurchase),
  );
  await standaloneDetail.press("Sign in");
  await standaloneDetail.close();
  expect(solutions.purchases).not.toHaveBeenCalled();
});

it("renders empty lists and unknown server status labels without inventing outcomes", async () => {
  solutions.offerings.mockResolvedValue({
    data: [],
    meta: { ...meta, last_page: 1 },
  });
  const offerings = await render(createElement(SolutionOfferings));
  expect(offerings.container.textContent).toContain("No published solutions");
  await offerings.close();
  store.user = { id: 1, role: "member" };
  solutions.purchases.mockResolvedValue({
    data: [],
    meta: { ...meta, last_page: 1 },
  });
  const shop = await render(createElement(SolutionPurchases));
  expect(shop.container.textContent).toContain("No solution purchases yet");
  await shop.close();
  const standalone = await render(createElement(PlatformSolutionPurchases));
  expect(standalone.container.textContent).toContain(
    "No solution purchases yet",
  );
  await standalone.close();
  solutions.purchases.mockResolvedValue({
    data: [{ ...purchase, status: "future" }],
    meta,
  });
  const unknownShop = await render(createElement(SolutionPurchases));
  expect(unknownShop.container.textContent).toContain("Unsupported status");
  await unknownShop.close();
  const unknownPlatform = await render(
    createElement(PlatformSolutionPurchases),
  );
  expect(unknownPlatform.container.textContent).toContain("Unsupported status");
  await unknownPlatform.close();
  solutions.purchase.mockResolvedValue({
    purchase_id: 3,
    status: "future",
    attempts: 0,
    options: { status: options },
  });
  const detail = await render(createElement(SolutionPurchase));
  expect(detail.container.textContent).toContain("Unsupported status");
  await detail.close();
  const platformDetail = await render(createElement(PlatformSolutionPurchase));
  expect(platformDetail.container.textContent).toContain("Unsupported status");
  await platformDetail.close();
});

it("shows retriable load errors and preserves failed command messages", async () => {
  solutions.offerings.mockRejectedValueOnce(new Error("Catalogue unavailable"));
  const offerings = await render(createElement(SolutionOfferings));
  expect(offerings.container.textContent).toContain("Request failed");
  await offerings.press("Retry");
  expect(solutions.offerings).toHaveBeenCalledTimes(2);
  await offerings.close();
  solutions.offering.mockRejectedValueOnce(new Error("Offering unavailable"));
  const offeringDetail = await render(createElement(SolutionOffering));
  expect(offeringDetail.container.textContent).toContain("Request failed");
  await offeringDetail.press("Retry");
  await offeringDetail.close();
  solutions.purchases.mockRejectedValueOnce(new Error("Purchases unavailable"));
  const shop = await render(createElement(SolutionPurchases));
  expect(shop.container.textContent).toContain("Request failed");
  await shop.press("Retry");
  await shop.close();
  solutions.purchase.mockRejectedValueOnce(new Error("Status unavailable"));
  const shopDetail = await render(createElement(SolutionPurchase));
  expect(shopDetail.container.textContent).toContain("Request failed");
  await shopDetail.press("Retry status");
  await shopDetail.close();
  solutions.purchases.mockRejectedValueOnce(
    new Error("Platform list unavailable"),
  );
  const standalone = await render(createElement(PlatformSolutionPurchases));
  expect(standalone.container.textContent).toContain(
    "Platform list unavailable",
  );
  await standalone.press("Retry list");
  await standalone.close();
  solutions.purchase.mockRejectedValueOnce(
    new Error("Platform status unavailable"),
  );
  const platformDetail = await render(createElement(PlatformSolutionPurchase));
  expect(platformDetail.container.textContent).toContain(
    "Platform status unavailable",
  );
  await platformDetail.press("Retry status");
  await platformDetail.close();
  solutions.publish.mockRejectedValueOnce(new Error("Cannot publish"));
  const form = await render(createElement(PublishSolutionOffering));
  await form.press("Publish");
  expect(form.container.textContent).toContain("Cannot publish");
  await form.close();
  solutions.bind.mockRejectedValueOnce(new Error("Cannot bind"));
  const bind = await render(createElement(BindSolutionPurchase));
  await bind.press("Bind order");
  expect(bind.container.textContent).toContain("Cannot bind");
  await bind.close();
  solutions.retry.mockRejectedValueOnce(new Error("Cannot retry"));
  const retryShop = await render(createElement(SolutionPurchase));
  await retryShop.press("Retry provisioning");
  expect(retryShop.container.textContent).toContain("Cannot retry");
  await retryShop.close();
  solutions.retry.mockRejectedValueOnce(new Error("Platform retry failed"));
  const retryPlatform = await render(createElement(PlatformSolutionPurchase));
  await retryPlatform.press("Retry provisioning");
  expect(retryPlatform.container.textContent).toContain(
    "Platform retry failed",
  );
  await retryPlatform.close();
});

it("discards stale queries when leaving a screen and reports transport failures", async () => {
  let resolveShop!: (value: {
    data: (typeof offering)[];
    meta: typeof meta;
  }) => void;
  solutions.offerings.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveShop = resolve;
      }),
  );
  const staleShop = await render(createElement(SolutionOfferings));
  await staleShop.close();
  await act(async () => resolveShop({ data: [offering], meta }));
  store.run = async () => {
    throw new Error("Transport disconnected");
  };
  const failedShop = await render(createElement(SolutionOfferings));
  expect(failedShop.container.textContent).toContain("Transport disconnected");
  await failedShop.close();
  let rejectShop!: (reason: Error) => void;
  store.run = async () =>
    new Promise((_resolve, reject) => {
      rejectShop = reject;
    });
  const staleFailure = await render(createElement(SolutionOfferings));
  await staleFailure.close();
  await act(async () => rejectShop(new Error("Late failure")));
  store.run = defaultRun;
  let resolvePlatform!: (value: {
    data: (typeof purchase)[];
    meta: typeof meta;
  }) => void;
  solutions.purchases.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolvePlatform = resolve;
      }),
  );
  const stalePlatform = await render(createElement(PlatformSolutionPurchases));
  await stalePlatform.close();
  await act(async () => resolvePlatform({ data: [purchase], meta }));
  let rejectPlatform!: (reason: Error) => void;
  solutions.purchases.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectPlatform = reject;
      }),
  );
  const stalePlatformFailure = await render(
    createElement(PlatformSolutionPurchases),
  );
  await stalePlatformFailure.close();
  await act(async () => rejectPlatform(new Error("Late failure")));
});

it("coalesces two retry presses while a standalone retry is pending", async () => {
  let resolve!: (value: { purchase_id: number; status: string }) => void;
  solutions.retry.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const detail = await render(createElement(PlatformSolutionPurchase));
  await act(async () => {
    detail.button("Retry provisioning").click();
    detail.button("Retry provisioning").click();
  });
  expect(solutions.retry).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ purchase_id: 3, status: "queued" }));
  await detail.close();
});
