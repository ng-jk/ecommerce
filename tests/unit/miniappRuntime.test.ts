import { expect, it, vi } from "vitest";
import { resolveAssetOrigin } from "../../packages/miniapps/services/runtime";
import { assetOrigin } from "../../packages/miniapps/services/runtime/logic/configuration";

it("validates configured asset origins and blocks cross-origin or insecure values", async () => {
  expect(assetOrigin({ miniappAssetOrigin: "https://miniapps.example.test" })).toBe("https://miniapps.example.test");
  expect(assetOrigin({ miniappAssetOrigin: "http://localhost:8080" })).toBe("http://localhost:8080");
  expect(assetOrigin({ miniappAssetOrigin: "http://miniapps.localhost:8080" })).toBe("http://miniapps.localhost:8080");
  for (const value of ["http://example.test", "https://example.test/", "https://user@example.test", "not-url"]) {
    expect(() => assetOrigin({ miniappAssetOrigin: value })).toThrow();
  }
  expect(() => assetOrigin({ miniappAssetOrigin: "https://example.test", token: "unexpected" })).toThrow();
  await expect(resolveAssetOrigin("https://miniapps.example.test")).resolves.toBe("https://miniapps.example.test");
});

it("loads bounded runtime JSON without credentials or redirects", async () => {
  const transport = vi.fn(async () => new Response(JSON.stringify({ miniappAssetOrigin: "https://miniapps.example.test" }), {
    status: 200, headers: { "content-type": "application/json" },
  }));
  await expect(resolveAssetOrigin("", transport as typeof fetch)).resolves.toBe("https://miniapps.example.test");
  expect(transport).toHaveBeenCalledWith("/shop3i-runtime.json", expect.objectContaining({ credentials: "omit", redirect: "error", cache: "no-store" }));
  vi.stubGlobal("fetch", transport);
  await expect(resolveAssetOrigin("")).resolves.toBe("https://miniapps.example.test");
  vi.unstubAllGlobals();
  for (const response of [
    new Response("", { status: 404 }),
    new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }),
    new Response("x".repeat(4097), { status: 200, headers: { "content-type": "application/json" } }),
    new Response("{bad", { status: 200, headers: { "content-type": "application/json" } }),
    new Response(JSON.stringify({ miniappAssetOrigin: "http://evil.test" }), { status: 200, headers: { "content-type": "application/json" } }),
  ]) await expect(resolveAssetOrigin("", (async () => response) as typeof fetch)).rejects.toThrow();
});

it("aborts a stalled runtime request", async () => {
  vi.useFakeTimers();
  try {
    const transport = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_done, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    const pending = resolveAssetOrigin("", transport as typeof fetch);
    const rejected = expect(pending).rejects.toThrow("aborted");
    await vi.advanceTimersByTimeAsync(5000);
    await rejected;
  } finally {
    vi.useRealTimers();
  }
});
