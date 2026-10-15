// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "../../packages/api-client";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const identity = { id: 1, name: "Owner", email: "owner@example.test", account_status: "active" };
const testSession = vi.hoisted(() => ({
  storage: { get: vi.fn(), set: vi.fn(), clear: vi.fn() },
  api: { me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() },
}));
vi.mock("../../frontend/admin/src/services/platform_session", () => ({
  createPlatformSessionClient: () => testSession,
}));
import { usePlatformProvider } from "../../frontend/admin/src/screens/platform_shell_screen/logic/usePlatformProvider";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  testSession.storage.get.mockResolvedValue(null);
  testSession.storage.set.mockResolvedValue(undefined);
  testSession.storage.clear.mockResolvedValue(undefined);
  testSession.api.me.mockResolvedValue({ user: identity });
  testSession.api.login.mockResolvedValue({ user: identity, token: "login-token" });
  testSession.api.register.mockResolvedValue({ user: identity, token: "register-token" });
  testSession.api.logout.mockResolvedValue({ logged_out: true });
});
afterEach(() => vi.useRealTimers());

async function mount() {
  let current!: ReturnType<typeof usePlatformProvider>;
  function Probe() {
    current = usePlatformProvider();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => { root.render(createElement(Probe)); });
  await act(async () => { await vi.runAllTimersAsync(); });
  return { get session() { return current; }, async close() { await act(async () => root.unmount()); } };
}

it("starts unauthenticated without a stored token, then stores and revokes a login token", async () => {
  const view = await mount();
  expect(view.session.loading).toBe(false);
  expect(view.session.user).toBeNull();
  expect(testSession.api.me).not.toHaveBeenCalled();
  let success = false;
  await act(async () => { success = await view.session.login(identity.email, "password", "device"); });
  expect(success).toBe(true);
  expect(testSession.api.login).toHaveBeenCalledWith({ email: identity.email, password: "password", device_name: "device" });
  expect(testSession.storage.set).toHaveBeenCalledWith("token", "login-token");
  expect(view.session.user).toEqual(identity);
  await act(async () => { success = await view.session.logout(); });
  expect(success).toBe(true);
  expect(testSession.api.logout).toHaveBeenCalledOnce();
  expect(testSession.storage.clear).toHaveBeenCalledOnce();
  expect(view.session.user).toBeNull();
  await view.close();
});

it("restores a native token and handles registration and refresh", async () => {
  testSession.storage.get.mockResolvedValue("stored-token");
  const view = await mount();
  expect(testSession.api.me).toHaveBeenCalledOnce();
  expect(view.session.user).toEqual(identity);
  await act(async () => { await view.session.register("Owner", identity.email, "long-password", "long-password", "device"); });
  expect(testSession.api.register).toHaveBeenCalledWith({ name: "Owner", email: identity.email, password: "long-password", password_confirmation: "long-password", device_name: "device" });
  expect(testSession.storage.set).toHaveBeenCalledWith("token", "register-token");
  await act(async () => { await view.session.refresh(); });
  expect(testSession.api.me).toHaveBeenCalledTimes(2);
  await view.close();
});

it("clears revoked credentials and reports recoverable network errors", async () => {
  testSession.storage.get.mockResolvedValue("stored-token");
  testSession.api.me.mockRejectedValueOnce(new ApiError("Revoked", 401, "unauthenticated"));
  const view = await mount();
  expect(testSession.storage.clear).toHaveBeenCalledOnce();
  expect(view.session.user).toBeNull();
  testSession.api.me.mockRejectedValueOnce(new ApiError("Offline", 0, "network"));
  await act(async () => { await view.session.refresh(); });
  expect(view.session.message).toBe("Offline");
  expect(testSession.storage.clear).toHaveBeenCalledOnce();
  await act(async () => view.session.clearMessage());
  expect(view.session.message).toBe("");
  await view.close();
});

it("clears a forbidden token before exposing any identity", async () => {
  testSession.storage.get.mockResolvedValue("stored-token");
  testSession.api.me.mockRejectedValueOnce(new ApiError("Disabled", 403, "forbidden"));
  const view = await mount();
  expect(view.session.user).toBeNull();
  expect(testSession.storage.clear).toHaveBeenCalledOnce();
  await view.close();
});

it("keeps local identity and token when login, registration or logout fails", async () => {
  const view = await mount();
  testSession.api.login.mockRejectedValueOnce(new Error("Wrong credentials"));
  await act(async () => { expect(await view.session.login("x", "bad", "device")).toBe(false); });
  expect(view.session.message).toBe("Wrong credentials");
  testSession.api.register.mockRejectedValueOnce(new Error("Duplicate"));
  await act(async () => { expect(await view.session.register("x", "x", "password", "password", "device")).toBe(false); });
  expect(view.session.message).toBe("Duplicate");
  testSession.api.logout.mockRejectedValueOnce(new Error("Offline"));
  await act(async () => { expect(await view.session.logout()).toBe(false); });
  expect(view.session.message).toBe("Offline");
  expect(testSession.storage.clear).not.toHaveBeenCalled();
  await view.close();
});
