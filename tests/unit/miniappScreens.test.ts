// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { MiniappsScreen } from "../../packages/miniapps/screens/miniapps_screen";
import { MiniappHostScreen } from "../../packages/miniapps/screens/miniapp_host_screen";
import { Frame as WebFrame } from "../../packages/miniapps/screens/miniapp_host_screen/interface/MiniappHostScreen";
import { AdminMiniappsScreen } from "../../packages/miniapps/screens/admin_miniapps_screen";
import { MiniappCreateScreen } from "../../packages/miniapps/screens/miniapp_create_screen";
import { MiniappEditScreen } from "../../packages/miniapps/screens/miniapp_edit_screen";
import type { MiniappClient } from "../../packages/miniapps";
import type {
  AdminListing,
  Launch,
} from "../../packages/miniapps/services/miniapps";
import { deferred } from "./reactHarness";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.mock("react-native", async () => {
  const React = await import("react");
  const View = React.forwardRef<HTMLDivElement, { children?: ReactNode }>(
    (props, ref) => React.createElement("div", { ref }, props.children),
  );
  return {
    View,
    ScrollView: View,
    Text: ({ children }: { children?: ReactNode }) =>
      React.createElement("span", {}, children),
    Pressable: ({
      children,
      onPress,
      disabled,
    }: {
      children?: ReactNode;
      onPress?: () => void;
      disabled?: boolean;
    }) =>
      React.createElement("button", { onClick: onPress, disabled }, children),
  };
});
const row: AdminListing["miniapps"]["data"][number] = {
  id: 3,
  package_id: 4,
  slug: "sample",
  name: "Sample",
  visibility: "public",
  version: "1.0.0",
  digest: "a".repeat(64),
  enabled: true,
  grants: ["catalog"],
  capabilities: ["catalog", "product"],
  config_version: 2,
};
const meta = { current_page: 1, last_page: 1, per_page: 20, total: 1 };
const result: AdminListing = {
  miniapps: { data: [row], meta },
  catalog: {
    data: [
      {
        package_id: 4,
        slug: "sample",
        name: "Sample",
        visibility: "public",
        versions: [
          {
            version: "1.0.0",
            digest: "a".repeat(64),
            capabilities: ["catalog", "product"],
          },
        ],
      },
    ],
    meta,
  },
};
const launch: Launch = {
  id: "00000000-0000-4000-8000-000000000001",
  entry_url: `https://miniapps.example.test/miniapp-assets/${"a".repeat(64)}/index.html`,
  origin: "https://miniapps.example.test",
  digest: "a".repeat(64),
  expires_at: "2099-01-01T00:00:00Z",
  capabilities: ["catalog"],
};
const client = {
  list: vi.fn(async () => ({ miniapps: result.miniapps })),
  launch: vi.fn(async () => ({ launch })),
  invoke: vi.fn(async () => ({ response: {} })),
  adminList: vi.fn(async () => result),
  install: vi.fn(async () => ({ miniapp: row })),
  update: vi.fn(async () => ({ miniapp: row })),
  reset: vi.fn(),
} as unknown as MiniappClient;
let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.list).mockImplementation(async () => ({
    miniapps: result.miniapps,
  }));
  vi.mocked(client.launch).mockImplementation(async () => ({ launch }));
  vi.mocked(client.adminList).mockImplementation(async () => result);
  vi.mocked(client.install).mockImplementation(async () => ({ miniapp: row }));
  vi.mocked(client.update).mockImplementation(async () => ({ miniapp: row }));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
async function render(element: React.ReactElement) {
  await act(async () => {
    root.render(element);
  });
}
async function press(label: string) {
  const button = [...container.querySelectorAll("button")].find((item) =>
    item.textContent?.includes(label),
  );
  expect(button, label).toBeDefined();
  await act(async () => {
    button?.click();
  });
}
async function cleanup() {
  await act(async () => root.unmount());
  container.remove();
}

it("lists only enabled installations and partitions results by principal", async () => {
  const onOpen = vi.fn(),
    onBack = vi.fn();
  await render(
    createElement(MiniappsScreen, {
      client,
      scope: "fashion.1",
      onOpen,
      onBack,
    }),
  );
  expect(container.textContent).toContain("Sample");
  await press("Sample");
  expect(onOpen).toHaveBeenCalledWith("3");
  await press("Previous");
  await press("Next");
  await press("Store");
  expect(onBack).toHaveBeenCalledOnce();
  const pending = deferred<Awaited<ReturnType<MiniappClient["list"]>>>();
  vi.mocked(client.list).mockReturnValueOnce(pending.promise);
  await render(
    createElement(MiniappsScreen, {
      client,
      scope: "fashion.2",
      onOpen,
      onBack,
    }),
  );
  expect(container.textContent).not.toContain("Sample");
  pending.resolve({ miniapps: { data: [], meta } });
  await act(async () => {
    await pending.promise;
  });
  expect(container.textContent).toContain("No MiniApps");
  await cleanup();
});

it("clears a previous launch when the principal or installation changes", async () => {
  const onBack = vi.fn();
  await render(
    createElement(MiniappHostScreen, {
      client,
      id: "3",
      scope: "fashion.1",
      origin: launch.origin,
      onBack,
    }),
  );
  expect(container.querySelector("iframe")).not.toBeNull();
  const pending = deferred<Awaited<ReturnType<MiniappClient["launch"]>>>();
  vi.mocked(client.launch).mockReturnValueOnce(pending.promise);
  await render(
    createElement(MiniappHostScreen, {
      client,
      id: "4",
      scope: "fashion.2",
      origin: launch.origin,
      onBack,
    }),
  );
  expect(container.querySelector("iframe")).toBeNull();
  await press("MiniApps");
  expect(onBack).toHaveBeenCalledOnce();
  pending.reject(new Error("unavailable"));
  await act(async () => {
    await pending.promise.catch(() => undefined);
  });
  expect(container.textContent).toContain("could not be launched");
  await cleanup();
});

it("admin lists catalog and uses the same standalone form for install and edit", async () => {
  const onBack = vi.fn(),
    onCreate = vi.fn(),
    onEdit = vi.fn(),
    onDone = vi.fn();
  await render(
    createElement(AdminMiniappsScreen, {
      client,
      scope: "fashion.admin.1",
      onBack,
      onCreate,
      onEdit,
    }),
  );
  await press("Edit");
  expect(onEdit).toHaveBeenCalledWith(3, 1);
  await press("Install");
  expect(onCreate).toHaveBeenCalledWith(4, 1);
  await press("Dashboard");
  expect(onBack).toHaveBeenCalledOnce();
  await render(
    createElement(MiniappCreateScreen, {
      client,
      packageId: 4,
      scope: "fashion.admin.1",
      onDone,
    }),
  );
  await press("catalog");
  await press("Save");
  expect(client.install).toHaveBeenCalledWith("4", "1.0.0", true, ["catalog"]);
  await render(
    createElement(MiniappEditScreen, {
      client,
      id: 3,
      scope: "fashion.admin.1",
      onDone,
    }),
  );
  await press("Enabled");
  await press("Save");
  expect(client.update).toHaveBeenCalledWith("3", 2, false, ["catalog"]);
  await cleanup();
});

it("renders merchant and admin list failures, empty states, and page boundaries", async () => {
  vi.mocked(client.list).mockRejectedValueOnce(new Error("offline"));
  await render(
    createElement(MiniappsScreen, {
      client,
      scope: "fashion.1",
      onOpen: vi.fn(),
      onBack: vi.fn(),
    }),
  );
  expect(container.textContent).toContain("could not be loaded");
  await render(
    createElement(MiniappsScreen, {
      client,
      scope: "fashion.2",
      onOpen: vi.fn(),
      onBack: vi.fn(),
    }),
  );
  expect(container.textContent).toContain("Sample");
  vi.mocked(client.adminList).mockResolvedValueOnce({
    miniapps: { data: [], meta },
    catalog: { data: [], meta },
  });
  await render(
    createElement(AdminMiniappsScreen, {
      client,
      scope: "fashion.admin.empty",
      onBack: vi.fn(),
      onCreate: vi.fn(),
      onEdit: vi.fn(),
    }),
  );
  expect(container.textContent).toContain("No MiniApps installed");
  expect(container.textContent).toContain("No approved packages");
  vi.mocked(client.adminList).mockRejectedValueOnce(new Error("offline"));
  await render(
    createElement(AdminMiniappsScreen, {
      client,
      scope: "fashion.admin.error",
      onBack: vi.fn(),
      onCreate: vi.fn(),
      onEdit: vi.fn(),
    }),
  );
  expect(container.textContent).toContain("could not be loaded");
  await cleanup();
});

it("keeps form errors on screen and shows unavailable direct link targets", async () => {
  const onDone = vi.fn();
  vi.mocked(client.adminList).mockResolvedValueOnce({
    miniapps: { data: [], meta },
    catalog: { data: [], meta },
  });
  await render(
    createElement(MiniappCreateScreen, {
      client,
      packageId: 77,
      page: 2,
      scope: "fashion.admin.1",
      onDone,
    }),
  );
  expect(container.textContent).toContain("Approved package unavailable");
  vi.mocked(client.adminList).mockResolvedValueOnce({
    miniapps: { data: [], meta },
    catalog: { data: [], meta },
  });
  await render(
    createElement(MiniappEditScreen, {
      client,
      id: 77,
      page: 2,
      scope: "fashion.admin.1",
      onDone,
    }),
  );
  expect(container.textContent).toContain("Installation unavailable");
  await render(
    createElement(MiniappCreateScreen, {
      client,
      packageId: 4,
      page: 1,
      scope: "fashion.admin.1",
      onDone,
    }),
  );
  vi.mocked(client.install).mockRejectedValueOnce(new Error("conflict"));
  await press("Save");
  expect(container.textContent).toContain("Could not save");
  expect(onDone).not.toHaveBeenCalled();
  expect(
    [...container.querySelectorAll("button")].some(
      (button) => button.textContent === "Cancel",
    ),
  ).toBe(false);
  await cleanup();
});

it("paginates merchant and admin collections and hides disabled MiniApps", async () => {
  const two = { ...meta, last_page: 2, total: 2 };
  vi.mocked(client.list).mockImplementation(async (page = 1) => ({
    miniapps: {
      data:
        page === 1
          ? [row, { ...row, id: 9, enabled: false }]
          : [{ ...row, id: 8, name: "Second" }],
      meta: two,
    },
  }));
  await render(
    createElement(MiniappsScreen, {
      client,
      scope: "fashion.1",
      onOpen: vi.fn(),
      onBack: vi.fn(),
    }),
  );
  expect(container.textContent).not.toContain("9");
  await press("Next");
  expect(container.textContent).toContain("Second");
  await press("Previous");
  expect(container.textContent).toContain("Sample");
  vi.mocked(client.adminList).mockImplementation(async (page = 1) => ({
    miniapps: {
      data: page === 1 ? [{ ...row, enabled: false }] : [row],
      meta: two,
    },
    catalog: { data: result.catalog.data, meta: two },
  }));
  await render(
    createElement(AdminMiniappsScreen, {
      client,
      scope: "fashion.admin.1",
      onBack: vi.fn(),
      onCreate: vi.fn(),
      onEdit: vi.fn(),
    }),
  );
  expect(container.textContent).toContain("Disabled");
  await press("Next");
  expect(client.adminList).toHaveBeenCalledWith(2);
  await press("Previous");
  expect(client.adminList).toHaveBeenCalledWith(1);
  await cleanup();
});

it("contains invalid load and update results without saving", async () => {
  const onDone = vi.fn();
  vi.mocked(client.adminList).mockRejectedValueOnce(new Error("offline"));
  await render(
    createElement(MiniappCreateScreen, {
      client,
      packageId: 4,
      scope: "fashion.admin.1",
      onDone,
    }),
  );
  expect(container.textContent).toContain("Approved package unavailable");
  vi.mocked(client.adminList).mockRejectedValueOnce(new Error("offline"));
  await render(
    createElement(MiniappEditScreen, {
      client,
      id: 3,
      scope: "fashion.admin.1",
      onDone,
    }),
  );
  expect(container.textContent).toContain("Installation unavailable");
  await render(
    createElement(MiniappEditScreen, {
      client,
      id: 3,
      scope: "fashion.admin.2",
      onDone,
    }),
  );
  vi.mocked(client.update).mockRejectedValueOnce(new Error("conflict"));
  await press("catalog");
  await press("Save");
  expect(container.textContent).toContain("Could not save");
  expect(onDone).not.toHaveBeenCalled();
  await cleanup();
});

it("web frame fails closed when its view is not a DOM element", async () => {
  const nativeHTMLElement = globalThis.HTMLElement;
  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: class NotDOMElement {},
  });
  try {
    await render(
      createElement(WebFrame, {
        client,
        id: "3",
        launch,
        origin: launch.origin,
      }),
    );
    expect(container.querySelector("iframe")).toBeNull();
    await cleanup();
  } finally {
    Object.defineProperty(globalThis, "HTMLElement", {
      configurable: true,
      value: nativeHTMLElement,
    });
  }
});

it("ignores completed and failed requests from earlier principals", async () => {
  const oldList = deferred<Awaited<ReturnType<MiniappClient["list"]>>>();
  vi.mocked(client.list).mockReturnValueOnce(oldList.promise);
  await render(
    createElement(MiniappsScreen, {
      client,
      scope: "fashion.old",
      onOpen: vi.fn(),
      onBack: vi.fn(),
    }),
  );
  await render(
    createElement(MiniappsScreen, {
      client,
      scope: "fashion.new",
      onOpen: vi.fn(),
      onBack: vi.fn(),
    }),
  );
  oldList.resolve({
    miniapps: { data: [{ ...row, id: 99, name: "Old principal" }], meta },
  });
  await act(async () => {
    await oldList.promise;
  });
  expect(container.textContent).not.toContain("Old principal");
  const oldAdmin = deferred<Awaited<ReturnType<MiniappClient["adminList"]>>>();
  vi.mocked(client.adminList).mockReturnValueOnce(oldAdmin.promise);
  await render(
    createElement(AdminMiniappsScreen, {
      client,
      scope: "fashion.admin.old",
      onBack: vi.fn(),
      onCreate: vi.fn(),
      onEdit: vi.fn(),
    }),
  );
  await render(
    createElement(AdminMiniappsScreen, {
      client,
      scope: "fashion.admin.new",
      onBack: vi.fn(),
      onCreate: vi.fn(),
      onEdit: vi.fn(),
    }),
  );
  oldAdmin.reject(new Error("old request"));
  await act(async () => {
    await oldAdmin.promise.catch(() => undefined);
  });
  expect(container.textContent).not.toContain("could not be loaded");
  const oldLaunch = deferred<Awaited<ReturnType<MiniappClient["launch"]>>>();
  vi.mocked(client.launch).mockReturnValueOnce(oldLaunch.promise);
  await render(
    createElement(MiniappHostScreen, {
      client,
      id: "3",
      scope: "fashion.old",
      origin: launch.origin,
      onBack: vi.fn(),
    }),
  );
  await render(
    createElement(MiniappHostScreen, {
      client,
      id: "3",
      scope: "fashion.new",
      origin: launch.origin,
      onBack: vi.fn(),
    }),
  );
  oldLaunch.reject(new Error("old launch"));
  await act(async () => {
    await oldLaunch.promise.catch(() => undefined);
  });
  expect(container.querySelector("iframe")).not.toBeNull();
  await cleanup();
});

it("web frame forwards only granted requests through the MiniApp client", async () => {
  const original = globalThis.MessageChannel;
  const channels: {
    port1: {
      onmessage: ((event: { data: unknown }) => void) | null;
      postMessage: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    };
    port2: { close: ReturnType<typeof vi.fn> };
  }[] = [];
  class TestChannel {
    port1 = {
      onmessage: null as ((event: { data: unknown }) => void) | null,
      postMessage: vi.fn(),
      close: vi.fn(),
    };
    port2 = { close: vi.fn() };
    constructor() {
      channels.push(this);
    }
  }
  vi.stubGlobal("MessageChannel", TestChannel);
  try {
    await render(
      createElement(WebFrame, {
        client,
        id: "3",
        launch,
        origin: launch.origin,
      }),
    );
    await act(async () => {
      channels[0]?.port1.onmessage?.({
        data: {
          type: "miniapp.request",
          session: launch.id,
          id: "read",
          capability: "catalog",
          input: { page: 1 },
        },
      });
      await Promise.resolve();
    });
    expect(client.invoke).toHaveBeenCalledWith("3", launch.id, "catalog", {
      page: 1,
    });
    expect(channels[0]?.port1.postMessage).toHaveBeenCalledWith({
      type: "miniapp.response",
      session: launch.id,
      id: "read",
      ok: true,
      result: {},
    });
    await cleanup();
  } finally {
    vi.stubGlobal("MessageChannel", original);
  }
});

it("create and edit pages discard stale results when the shop or page changes", async () => {
  const onDone = vi.fn();
  const oldCreate = deferred<Awaited<ReturnType<MiniappClient["adminList"]>>>();
  vi.mocked(client.adminList)
    .mockReturnValueOnce(oldCreate.promise)
    .mockResolvedValueOnce({
      ...result,
      catalog: { data: [{ ...result.catalog.data[0]!, versions: [] }], meta },
    });
  await render(
    createElement(MiniappCreateScreen, {
      client,
      packageId: 4,
      page: 1,
      scope: "fashion.admin.old",
      onDone,
    }),
  );
  await render(
    createElement(MiniappCreateScreen, {
      client,
      packageId: 4,
      page: 2,
      scope: "fashion.admin.new",
      onDone,
    }),
  );
  expect(container.textContent).toContain("Approved package unavailable");
  oldCreate.resolve(result);
  await act(async () => {
    await oldCreate.promise;
  });
  expect(container.textContent).toContain("Approved package unavailable");
  const oldEdit = deferred<Awaited<ReturnType<MiniappClient["adminList"]>>>();
  vi.mocked(client.adminList)
    .mockReturnValueOnce(oldEdit.promise)
    .mockResolvedValueOnce({ ...result, miniapps: { data: [], meta } });
  await render(
    createElement(MiniappEditScreen, {
      client,
      id: 3,
      page: 1,
      scope: "fashion.admin.old",
      onDone,
    }),
  );
  await render(
    createElement(MiniappEditScreen, {
      client,
      id: 3,
      page: 2,
      scope: "fashion.admin.new",
      onDone,
    }),
  );
  oldEdit.resolve(result);
  await act(async () => {
    await oldEdit.promise;
  });
  expect(container.textContent).toContain("Installation unavailable");
  await cleanup();
});

it("late failures and successes cannot restore another principal's screens", async () => {
  const oldList = deferred<Awaited<ReturnType<MiniappClient["list"]>>>();
  vi.mocked(client.list).mockReturnValueOnce(oldList.promise);
  await render(
    createElement(MiniappsScreen, {
      client,
      scope: "old",
      onOpen: vi.fn(),
      onBack: vi.fn(),
    }),
  );
  await render(
    createElement(MiniappsScreen, {
      client,
      scope: "new",
      onOpen: vi.fn(),
      onBack: vi.fn(),
    }),
  );
  oldList.reject(new Error("old"));
  await act(async () => {
    await oldList.promise.catch(() => undefined);
  });
  expect(container.textContent).toContain("Sample");
  const oldAdmin = deferred<Awaited<ReturnType<MiniappClient["adminList"]>>>();
  vi.mocked(client.adminList).mockReturnValueOnce(oldAdmin.promise);
  await render(
    createElement(AdminMiniappsScreen, {
      client,
      scope: "old",
      onBack: vi.fn(),
      onCreate: vi.fn(),
      onEdit: vi.fn(),
    }),
  );
  await render(
    createElement(AdminMiniappsScreen, {
      client,
      scope: "new",
      onBack: vi.fn(),
      onCreate: vi.fn(),
      onEdit: vi.fn(),
    }),
  );
  oldAdmin.resolve(result);
  await act(async () => {
    await oldAdmin.promise;
  });
  expect(container.textContent).toContain("Sample");
  const oldLaunch = deferred<Awaited<ReturnType<MiniappClient["launch"]>>>();
  vi.mocked(client.launch).mockReturnValueOnce(oldLaunch.promise);
  await render(
    createElement(MiniappHostScreen, {
      client,
      id: "3",
      scope: "old",
      origin: launch.origin,
      onBack: vi.fn(),
    }),
  );
  await render(
    createElement(MiniappHostScreen, {
      client,
      id: "3",
      scope: "new",
      origin: launch.origin,
      onBack: vi.fn(),
    }),
  );
  oldLaunch.resolve({ launch });
  await act(async () => {
    await oldLaunch.promise;
  });
  expect(container.querySelectorAll("iframe")).toHaveLength(1);
  await cleanup();
});

it("ignores failed form lookups from an earlier shop", async () => {
  const onDone = vi.fn();
  const oldCreate = deferred<Awaited<ReturnType<MiniappClient["adminList"]>>>();
  vi.mocked(client.adminList).mockReturnValueOnce(oldCreate.promise);
  await render(
    createElement(MiniappCreateScreen, {
      client,
      packageId: 4,
      scope: "old",
      onDone,
    }),
  );
  await render(
    createElement(MiniappCreateScreen, {
      client,
      packageId: 4,
      scope: "new",
      onDone,
    }),
  );
  oldCreate.reject(new Error("old failure"));
  await act(async () => {
    await oldCreate.promise.catch(() => undefined);
  });
  expect(container.textContent).toContain("Sample");
  const oldEdit = deferred<Awaited<ReturnType<MiniappClient["adminList"]>>>();
  vi.mocked(client.adminList).mockReturnValueOnce(oldEdit.promise);
  await render(
    createElement(MiniappEditScreen, { client, id: 3, scope: "old", onDone }),
  );
  await render(
    createElement(MiniappEditScreen, { client, id: 3, scope: "new", onDone }),
  );
  oldEdit.reject(new Error("old failure"));
  await act(async () => {
    await oldEdit.promise.catch(() => undefined);
  });
  expect(container.textContent).toContain("Sample");
  await cleanup();
});
