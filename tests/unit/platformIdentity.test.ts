import { describe, expect, it, vi } from "vitest";
import { createPlatformClient } from "../../packages/api-client";
import { createTransport } from "../../packages/api-client/services/transport";
import { memoryStorage } from "../../packages/api-client/services/cache";

const id = "00000000-0000-4000-8000-000000000001";
const user = { id: 3, name: "Owner", email: "owner@example.test", account_status: "active" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function fixture(result: unknown) {
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(json({ operation_id: id, status: "queued", poll_url: `/api/v1/platform/operations/${id}` }, 202))
    .mockResolvedValueOnce(json({ operation_id: id, status: "succeeded", http_status: 200, result }));
  const options = { origin: "https://example.test", native: true, getToken: async () => "private-token", randomUUID: () => id,
    storage: memoryStorage(), fetch: fetcher, sleep: async () => undefined, digest: async () => "identity" };
  return { api: createPlatformClient(options), fetcher, options };
}

describe("shop-independent platform SDK", () => {
  it("shares the assistant protocol and purges platform credentials on confirmed logout", async () => {
    const reply = { status: "completed", message: "Signed out", available_actions: [], required_input: [], executed_action: "platform.auth.logout", api_result: { logged_out: true } };
    const { api, options, fetcher } = fixture(reply);
    await options.storage.set("token", "private-token");
    await expect(api.assistant({ action: "platformLogout" }, 3)).resolves.toEqual(reply);
    expect(await options.storage.get("token")).toBeNull();
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://example.test/api/v1/platform/assistant");
  });
  it("registers using a durable platform receipt and validated credentials", async () => {
    const { api, fetcher } = fixture({ user, token: "issued-token" });
    await expect(api.register({ name: "Owner", email: user.email, password: "long-password", password_confirmation: "long-password", device_name: "test" }))
      .resolves.toEqual({ user, token: "issued-token" });
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://example.test/api/v1/platform/auth/register");
    expect(fetcher.mock.calls[1]?.[0]).toBe(`https://example.test/api/v1/platform/operations/${id}`);
    expect(() => api.register({ name: "Owner", email: user.email, password: "long-password", password_confirmation: "different-password", device_name: "test" })).toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("logs in, reads current identity and logs out through the same worker transport", async () => {
    const login = fixture({ user, token: "issued-token" });
    await expect(login.api.login({ email: user.email, password: "long-password", device_name: "test" })).resolves.toEqual({ user, token: "issued-token" });
    const identity = fixture({ user });
    await expect(identity.api.me()).resolves.toEqual({ user });
    expect(identity.fetcher).toHaveBeenCalledTimes(2);
    const logout = fixture({ logged_out: true });
    await expect(logout.api.logout()).resolves.toEqual({ logged_out: true });
    expect(logout.fetcher.mock.calls[0]?.[0]).toBe("https://example.test/api/v1/platform/auth/logout");
  });

  it("uses organization commands without a fabricated shop or browser bearer persistence", async () => {
    const result = { organization: { id: 4, code: "studio", name: "Studio", status: "active", version: 0 }, options: { status: { active: "Active" } } };
    const { api, fetcher, options } = fixture(result);
    await expect(api.workspace.organization(4)).resolves.toEqual(result);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://example.test/api/v1/platform/organizations/4");
    expect(() => createTransport({ ...options, native: false, platform: true })).toThrow("secure bearer token adapter");
  });
});
