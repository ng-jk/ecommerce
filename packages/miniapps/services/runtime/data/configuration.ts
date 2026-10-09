import { assetOrigin } from "../logic/configuration";

export async function resolveAssetOrigin(
  configured: string,
  transport: typeof fetch = fetch,
): Promise<string> {
  if (configured) return assetOrigin({ miniappAssetOrigin: configured });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await transport("/shop3i-runtime.json", {
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
    if (
      response.status !== 200 ||
      !response.headers.get("content-type")?.includes("application/json")
    ) {
      throw new Error("Mini App runtime configuration unavailable");
    }
    const text = await response.text();
    if (text.length > 4096) throw new Error("Runtime configuration too large");
    return assetOrigin(JSON.parse(text));
  } finally {
    clearTimeout(timer);
  }
}
