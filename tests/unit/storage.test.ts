import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  values: new Map<string, string>(),
  os: "web",
}));
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return native.os;
    },
  },
}));
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digestStringAsync: async (_algorithm: string, value: string) =>
    `hash-${value}`,
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => native.values.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    native.values.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    native.values.delete(key);
  },
}));
import { localStorageAdapter } from "../../packages/storefront/data/storage";

function webStorage() {
  const values: Record<string, string> = {};
  Object.defineProperties(values, {
    getItem: { value: (key: string) => values[key] ?? null },
    setItem: {
      value: (key: string, value: string) => {
        values[key] = value;
      },
    },
    removeItem: {
      value: (key: string) => {
        delete values[key];
      },
    },
  });
  return values;
}
beforeEach(() => {
  native.values.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(["web", "ios"])("%s scoped persistent storage", (os) => {
  beforeEach(() => {
    native.os = os;
    vi.stubGlobal("window", { localStorage: webStorage() });
  });
  it("isolates principals, updates existing values, removes entries and clears tokens", async () => {
    const first = localStorageAdapter("fashion.1");
    const second = localStorageAdapter("electronics.1");
    expect(await first.get("missing")).toBeNull();
    await first.set("pending", "receipt");
    await first.set("pending", "updated");
    await second.set("pending", "other");
    await first.set("token", "secret");
    expect(await first.get("pending")).toBe("updated");
    await first.remove("pending");
    expect(await first.get("pending")).toBeNull();
    await first.set("pending", "again");
    await first.clear?.();
    expect(await first.get("pending")).toBeNull();
    expect(await first.get("token")).toBeNull();
    expect(await second.get("pending")).toBe("other");
  });
  it("evicts disposable cache without evicting pending actions", async () => {
    const store = localStorageAdapter("fashion.2");
    await store.set("commerce.v1.catalog", "cached");
    for (let index = 0; index < 99; index++)
      await store.set(`pending.${index}`, "receipt");
    await store.set("pending.new", "new");
    expect(await store.get("commerce.v1.catalog")).toBeNull();
    expect(await store.get("pending.0")).toBe("receipt");
    await expect(store.set("pending.overflow", "receipt")).rejects.toThrow(
      "storage is full",
    );
    await store.set("pending.0", "updated");
    expect(await store.get("pending.0")).toBe("updated");
    await store.remove("pending.1");
    await store.set("pending.recovered", "recovered");
    expect(await store.get("pending.recovered")).toBe("recovered");
  });
});

it("returns no browser cache during server rendering", async () => {
  native.os = "web";
  vi.stubGlobal("window", undefined);
  expect(await localStorageAdapter("scope").get("key")).toBeNull();
});

it.each(["{broken", '{"wrong":true}'])(
  "recovers malformed native manifest %s",
  async (manifest) => {
    native.os = "ios";
    native.values.set("scope.manifest", manifest);
    const store = localStorageAdapter("scope");
    await store.set("pending", "receipt");
    expect(await store.get("pending")).toBe("receipt");
    await store.clear?.();
    expect(await store.get("pending")).toBeNull();
  },
);
