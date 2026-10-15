import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({ os: "web", values: new Map<string, string>() }));
vi.mock("react-native", () => ({ Platform: { get OS() { return host.os; } } }));
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digestStringAsync: async (_algorithm: string, value: string) => `hash-${value}`,
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => host.values.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { host.values.set(key, value); },
  deleteItemAsync: async (key: string) => { host.values.delete(key); },
}));

import { platformStorage } from "../../frontend/admin/src/services/platform_session/data/storage";

beforeEach(async () => {
  host.os = "web";
  host.values.clear();
  await platformStorage().clear?.();
});

describe.each(["web", "ios"])('platform bearer storage on %s', os => {
  it("keeps token and pending receipts together, then clears them", async () => {
    host.os = os;
    const first = platformStorage();
    const second = platformStorage();
    expect(await first.get("token")).toBeNull();
    await first.set("token", "secret");
    await first.set("pending.command", "receipt");
    expect(await second.get("token")).toBe("secret");
    expect(await second.get("pending.command")).toBe("receipt");
    await first.set("token", "new-secret");
    expect(await second.get("token")).toBe("new-secret");
    await first.remove("pending.command");
    expect(await second.get("pending.command")).toBeNull();
    await first.clear?.();
    expect(await second.get("token")).toBeNull();
    expect(host.values.size).toBe(0);
  });

  it("bounds the number of pending actions without discarding a receipt", async () => {
    host.os = os;
    const storage = platformStorage();
    for (let index = 0; index < 100; index++) await storage.set(`pending.${index}`, String(index));
    await expect(storage.set("pending.overflow", "lost")).rejects.toThrow("storage is full");
    expect(await storage.get("pending.0")).toBe("0");
    await storage.remove("pending.0");
    await storage.set("pending.replacement", "safe");
    expect(await storage.get("pending.replacement")).toBe("safe");
    await storage.clear?.();
  });
});

it("recovers from a corrupt native key manifest without exposing old keys", async () => {
  host.os = "ios";
  host.values.set("portfolio.platform.manifest", "not-json");
  const storage = platformStorage();
  await storage.set("token", "new-token");
  expect(await storage.get("token")).toBe("new-token");
  await storage.clear?.();
  host.values.set("portfolio.platform.manifest", JSON.stringify([4]));
  await storage.set("token", "next-token");
  expect(await storage.get("token")).toBe("next-token");
  await storage.clear?.();
  host.values.set("portfolio.platform.manifest", JSON.stringify({ old: "token" }));
  await storage.set("token", "last-token");
  expect(await storage.get("token")).toBe("last-token");
  await storage.clear?.();
});
