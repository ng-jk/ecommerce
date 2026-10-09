import { z } from "zod";

export function assetOrigin(value: unknown): string {
  const config = z
    .object({ miniappAssetOrigin: z.string().url() })
    .strict()
    .parse(value);
  const url = new URL(config.miniappAssetOrigin);
  const local =
    url.hostname === "localhost" || url.hostname.endsWith(".localhost");
  if (
    url.origin !== config.miniappAssetOrigin ||
    (url.protocol !== "https:" && !(local && url.protocol === "http:"))
  ) {
    throw new Error("Invalid Mini App asset origin");
  }
  return url.origin;
}
