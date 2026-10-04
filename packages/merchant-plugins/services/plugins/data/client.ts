import {
  createTransport,
  type TransportOptions,
} from "@portfolio/api-client/services/transport";
import type { StoragePort } from "@portfolio/api-client/services/contracts";
import { z } from "zod";
import type { PluginClient } from "../logic/types";

const integer = z.number().int().safe().positive();
const draftSchema = z
  .object({
    enabled: z.boolean(),
    customer_enabled: z.boolean(),
    max_credit: z.number().int().safe().min(1).max(10000),
  })
  .strict();
const plugin = z.object({
  id: integer,
  plugin_id: z.literal("loyalty"),
  version: z.number().int().safe().nonnegative(),
  enabled: z.boolean(),
  customer_enabled: z.boolean(),
  max_credit: z.number().int().safe().min(1).max(10000),
  created_at: z.string(),
  updated_at: z.string(),
});
const options = z.object({ plugin_id: z.record(z.string()) });
const detail = z.object({ plugin, options });
const list = z.object({
  plugins: z.object({
    data: z.array(plugin),
    meta: z.object({
      current_page: integer,
      last_page: integer,
      per_page: integer,
      total: z.number().int().nonnegative(),
    }),
  }),
  options,
});
const balance = z.object({
  balance: z.object({ points: z.number().int().safe().min(0).max(2147483647) }),
});
export function createPluginClient(config: TransportOptions): PluginClient {
  const request = createTransport(config);
  const scoped = (principalId: number): StoragePort => {
    const prefix = `plugin.${integer.parse(principalId)}.`;
    return {
      get: (key) => config.storage.get(prefix + key),
      set: (key, value) => config.storage.set(prefix + key, value),
      remove: (key) => config.storage.remove(prefix + key),
    };
  };
  return {
    list: (page = 1, enabled) =>
      request(
        `admin/plugins?page=${integer.parse(page)}${enabled === undefined ? "" : `&enabled=${z.boolean().parse(enabled) ? 1 : 0}`}`,
        list,
      ),
    detail: (id) => request(`admin/plugins/${integer.parse(id)}`, detail),
    install: (principalId, draft) =>
      request(
        "admin/plugins",
        detail,
        "POST",
        { plugin_id: "loyalty", ...draftSchema.parse(draft) },
        undefined,
        scoped(principalId),
      ),
    update: (principalId, id, expectedVersion, draft) =>
      request(
        `admin/plugins/${integer.parse(id)}`,
        detail,
        "PATCH",
        {
          expected_version: z
            .number()
            .int()
            .safe()
            .nonnegative()
            .parse(expectedVersion),
          ...draftSchema.parse(draft),
        },
        undefined,
        scoped(principalId),
      ),
    balance: () => request("plugins/loyalty/balance", balance),
    credit: (principalId, userId, points, reason) =>
      request(
        "admin/plugins/loyalty/credit",
        balance,
        "POST",
        {
          user_id: integer.parse(userId),
          points: z.number().int().safe().min(1).max(10000).parse(points),
          reason: z.string().min(1).max(200).parse(reason),
        },
        undefined,
        scoped(principalId),
      ),
  };
}
