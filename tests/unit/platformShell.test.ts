// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const host = vi.hoisted(() => ({ message: "Notice", pressed: vi.fn() }));
vi.mock("react-native", () => ({
  ScrollView: ({ children }: { children: ReactNode }) =>
    createElement("div", {}, children),
  View: ({ children }: { children: ReactNode }) =>
    createElement("div", {}, children),
  Text: ({ children }: { children: ReactNode }) =>
    createElement("span", {}, children),
  TextInput: ({
    accessibilityLabel,
    value,
    onChangeText,
  }: {
    accessibilityLabel: string;
    value: string;
    onChangeText(value: string): void;
  }) =>
    createElement("input", {
      "aria-label": accessibilityLabel,
      value,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        onChangeText(event.currentTarget.value),
    }),
  Pressable: ({
    children,
    accessibilityLabel,
    disabled,
    onPress,
  }: {
    children: ReactNode;
    accessibilityLabel: string;
    disabled?: boolean;
    onPress(): void;
  }) =>
    createElement(
      "button",
      { "aria-label": accessibilityLabel, disabled, onClick: onPress },
      children,
    ),
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: ReactNode }) =>
    createElement("div", {}, children),
}));
vi.mock("expo-router", () => ({
  Stack: () => createElement("div", { "data-testid": "platform-stack" }),
}));
vi.mock(
  "../../frontend/admin/src/screens/platform_shell_screen/logic/usePlatformProvider",
  () => ({
    usePlatformProvider: () => ({ message: host.message }),
  }),
);
import {
  PlatformButton,
  PlatformField,
  PlatformPage,
  PlatformProvider,
  PlatformText,
  usePlatformSession,
} from "../../frontend/admin/src/screens/platform_shell_screen";
import PlatformLayout from "../../frontend/admin/src/app/platform/_layout";

it("mounts the platform route stack inside its independent provider", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(createElement(PlatformLayout)));
  expect(
    container.querySelector('[data-testid="platform-stack"]'),
  ).not.toBeNull();
  await act(async () => root.unmount());
});

it("renders a standalone platform page, fields and disabled controls", async () => {
  let latest = "";
  const root = createRoot(document.createElement("div"));
  const container = document.createElement("div");
  const mounted = createRoot(container);
  await act(async () =>
    mounted.render(
      createElement(PlatformProvider, {
        children: createElement(PlatformPage, {
          title: "Platform",
          children: [
            createElement(PlatformText, {
              key: "welcome",
              children: "Welcome",
            }),
            createElement(PlatformField, {
              key: "email",
              label: "Email",
              value: "",
              onChangeText: (value) => {
                latest = value;
              },
            }),
            createElement(PlatformButton, {
              key: "continue",
              title: "Continue",
              onPress: host.pressed,
            }),
            createElement(PlatformButton, {
              key: "disabled",
              title: "Disabled",
              onPress: host.pressed,
              disabled: true,
              secondary: true,
            }),
          ],
        }),
      }),
    ),
  );
  expect(container.textContent).toContain("Platform");
  expect(container.textContent).toContain("Notice");
  expect(container.textContent).toContain("Welcome");
  expect(container.querySelectorAll("button")).toHaveLength(2);
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('button[aria-label="Continue"]')
      ?.click(),
  );
  expect(host.pressed).toHaveBeenCalledOnce();
  expect(
    container.querySelector<HTMLButtonElement>('button[aria-label="Disabled"]')
      ?.disabled,
  ).toBe(true);
  const input = container.querySelector<HTMLInputElement>(
    'input[aria-label="Email"]',
  );
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, "owner@example.test");
    input?.dispatchEvent(new Event("input", { bubbles: true }));
    input?.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(latest).toBe("owner@example.test");
  await act(async () => mounted.unmount());
  await act(async () => root.unmount());
});

it("requires the route-local platform provider", () => {
  function Probe() {
    usePlatformSession();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    expect(() => act(() => root.render(createElement(Probe)))).toThrow(
      "Platform session is unavailable",
    );
  } finally {
    errors.mockRestore();
    act(() => root.unmount());
  }
});
