import { expect, it, vi } from "vitest";
import { createShopSlug } from "../../packages/api-client";
import { loadDeploymentProfile, parseDeploymentProfile } from "../../packages/storefront/services/profile";

const profile = {
  version: 1,
  shop: "company-one",
  themeBase: "fashion",
  branding: {
    brand: "Company One", label: "Company One store", title: "A company home",
    subtitle: "Shop and explore", accent: "#123456", bg: "#ffffff",
    ink: "#111111", hero: "#eeeeee", image: "https://example.test/hero.jpg",
  },
  home: { kind: "miniapp", installationId: 7 },
};

it("validates a dynamic company tenant and approved-installation home selector", () => {
  expect(parseDeploymentProfile(profile).shop).toBe(createShopSlug("company-one"));
  expect(parseDeploymentProfile({ ...profile, home: { kind: "general" } }).home.kind).toBe("general");
  for (const invalid of [
    { ...profile, shop: "../other" },
    { ...profile, version: 2 },
    { ...profile, home: { kind: "miniapp", installationId: 0 } },
    { ...profile, branding: { ...profile.branding, bg: "red" } },
    { ...profile, branding: { ...profile.branding, image: "http://example.test/a" } },
    { ...profile, token: "unexpected" },
  ]) expect(() => parseDeploymentProfile(invalid)).toThrow();
  expect(() => createShopSlug("A")).toThrow();
});

it("loads only bounded JSON without credentials and handles absent legacy profile", async () => {
  const fetcher = vi.fn(async (_url: string, _options: RequestInit) =>
    new Response(JSON.stringify(profile), { status: 200, headers: { "content-type": "application/json" } }));
  const result = await loadDeploymentProfile(fetcher as typeof fetch);
  expect(result?.shop).toBe("company-one");
  expect(fetcher).toHaveBeenCalledWith("/shop3i-profile.json", expect.objectContaining({ credentials: "omit", redirect: "error", cache: "no-store" }));
  const missing = vi.fn(async () => new Response("", { status: 404 }));
  await expect(loadDeploymentProfile(missing as typeof fetch)).resolves.toBeNull();
  await expect(loadDeploymentProfile(missing as typeof fetch, true)).rejects.toThrow();
  const html = vi.fn(async () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }));
  await expect(loadDeploymentProfile(html as typeof fetch)).resolves.toBeNull();
  await expect(loadDeploymentProfile(html as typeof fetch, true)).rejects.toThrow();
  for (const response of [
    new Response("oops", { status: 503, headers: { "content-type": "application/json" } }),
    new Response("x".repeat(8193), { status: 200, headers: { "content-type": "application/json" } }),
    new Response("{bad", { status: 200, headers: { "content-type": "application/json" } }),
  ]) await expect(loadDeploymentProfile((async () => response) as typeof fetch)).rejects.toThrow();
});

it("aborts a profile request after the bounded deadline", async () => {
  vi.useFakeTimers();
  try {
    const fetcher = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    const pending = loadDeploymentProfile(fetcher as typeof fetch);
    const rejection = expect(pending).rejects.toThrow("aborted");
    await vi.advanceTimersByTimeAsync(5000);
    await rejection;
  } finally {
    vi.useRealTimers();
  }
});
