import { z } from "zod";

export const capability = z.enum([
  "catalog",
  "product",
  "cart.read",
  "orders",
  "plugin.loyalty.balance",
]);
export type Capability = z.infer<typeof capability>;
const pageMeta = z.object({
  current_page: z.number().int().positive(),
  last_page: z.number().int().nonnegative(),
  per_page: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
const listed = z.object({
  id: z.number().int().positive(),
  slug: z.string(),
  name: z.string(),
  version: z.string(),
  digest: z.string(),
  enabled: z.boolean(),
  capabilities: z.array(capability),
  grants: z.array(capability),
  config_version: z.number().int().nonnegative(),
});
export const listResult = z.object({
  miniapps: z.object({ data: z.array(listed), meta: pageMeta }),
});
export const launchResult = z.object({
  launch: z.object({
    id: z.string().uuid(),
    entry_url: z.string().url(),
    origin: z.string().url(),
    digest: z.string(),
    expires_at: z.string(),
    capabilities: z.array(capability),
  }),
});
export const invokeResult = z.object({ response: z.unknown() });
export const adminResult = z.object({
  miniapps: z.object({
    data: z.array(
      listed.extend({
        package_id: z.number().int().positive(),
        visibility: z.string(),
      }),
    ),
    meta: pageMeta,
  }),
  catalog: z.object({
    data: z.array(
      z.object({
        package_id: z.number().int().positive(),
        slug: z.string(),
        name: z.string(),
        visibility: z.string(),
        versions: z.array(
          z.object({
            version: z.string(),
            digest: z.string(),
            capabilities: z.array(capability),
          }),
        ),
      }),
    ),
    meta: pageMeta,
  }),
});
export type Miniapp = z.infer<typeof listed>;
export type Launch = z.infer<typeof launchResult>["launch"];
export type AdminListing = z.infer<typeof adminResult>;

export function validateLaunch(
  launch: Launch,
  expectedOrigin: string,
  now = Date.now(),
): Launch {
  const parsed = launchResult.shape.launch.parse(launch);
  const origin = new URL(parsed.origin);
  const entry = new URL(parsed.entry_url);
  const expected = new URL(expectedOrigin);
  const local =
    expected.hostname === "localhost" ||
    expected.hostname.endsWith(".localhost");
  const expiry = Date.parse(parsed.expires_at);
  if (
    origin.origin !== expected.origin ||
    entry.origin !== expected.origin ||
    !(origin.protocol === "https:" || (local && origin.protocol === "http:")) ||
    !/^[a-f0-9]{64}$/.test(parsed.digest) ||
    !entry.pathname.startsWith(`/miniapp-assets/${parsed.digest}/`) ||
    entry.username ||
    entry.password ||
    entry.search ||
    entry.hash ||
    !Number.isFinite(expiry) ||
    expiry <= now
  ) {
    throw new Error("MiniApp launch failed its origin or expiry check.");
  }
  return parsed;
}

export function validateInput(
  name: Capability,
  input: unknown,
): Record<string, number> {
  if (name === "product")
    return z.object({ id: z.number().int().positive() }).strict().parse(input);
  if (name === "catalog") {
    const parsed = z
      .object({ page: z.number().int().positive().max(100000).optional() })
      .strict()
      .parse(input);
    return parsed.page === undefined ? {} : { page: parsed.page };
  }
  return z.object({}).strict().parse(input);
}
