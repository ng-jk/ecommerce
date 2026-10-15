import { beforeEach, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({ os: "web", options: null as Record<string, unknown> | null, token: "secret" }));
vi.mock("react-native", () => ({ Platform: { get OS() { return host.os; } } }));
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  randomUUID: () => "id",
  digestStringAsync: async (_algorithm: string, value: string) => `digest-${value}`,
}));
vi.mock("@portfolio/api-client", () => ({ createPlatformClient: (options: Record<string, unknown>) => {
  host.options = options;
  return { register: vi.fn() };
} }));
vi.mock("../../frontend/admin/src/services/platform_session/data/storage", () => ({
  platformStorage: () => ({ get: async () => host.token, set: vi.fn(), remove: vi.fn() }),
}));
import { createPlatformSessionClient } from "../../frontend/admin/src/services/platform_session/data/client";

beforeEach(() => { host.os = "web"; host.options = null; });

it("uses same-origin bearer transport and memory token on web", async () => {
  const { api } = createPlatformSessionClient();
  expect(api.register).toBeDefined();
  expect(host.options).toMatchObject({ origin: "", native: true });
  expect(await (host.options?.getToken as () => Promise<string>)()).toBe("secret");
  expect(await (host.options?.digest as (value: string) => Promise<string>)("command")).toBe("digest-command");
  expect((host.options?.randomUUID as () => string)()).toBe("id");
});

it("uses the configured API origin on native devices", () => {
  host.os = "ios";
  const previous = process.env.EXPO_PUBLIC_API_URL;
  process.env.EXPO_PUBLIC_API_URL = "https://api.example.test";
  try {
    createPlatformSessionClient();
    expect(host.options).toMatchObject({ origin: "https://api.example.test", native: true });
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = previous;
  }
});

it("uses the local API default for native development", () => {
  host.os = "android";
  const previous = process.env.EXPO_PUBLIC_API_URL;
  delete process.env.EXPO_PUBLIC_API_URL;
  try {
    createPlatformSessionClient();
    expect(host.options).toMatchObject({ origin: "http://localhost:8080", native: true });
  } finally {
    if (previous !== undefined) process.env.EXPO_PUBLIC_API_URL = previous;
  }
});
