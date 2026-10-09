import {
  createTransport,
  type TransportOptions,
} from "@portfolio/api-client/services/transport";
import { memoryStorage } from "@portfolio/api-client/services/cache";
import { z } from "zod";
import {
  adminResult,
  capability,
  invokeResult,
  launchResult,
  listResult,
  validateInput,
} from "../logic/types";

export function createMiniappClient(options: TransportOptions) {
  // Read-only MiniApp operations use transient receipts, reset whenever the principal changes.
  let request = createTransport({ ...options, storage: memoryStorage() });
  const id = (value: string | number) =>
    z.coerce.number().int().positive().parse(value);
  const launchId = (value: string) => z.string().uuid().parse(value);
  const page = (value: number) =>
    z.number().int().positive().max(100000).parse(value);
  return {
    reset: () => {
      request = createTransport({ ...options, storage: memoryStorage() });
    },
    list: (n = 1) => request(`miniapps?page=${page(n)}`, listResult),
    launch: (miniappId: string) =>
      request(`miniapps/${id(miniappId)}/launch`, launchResult, "POST", {}),
    invoke: (
      miniappId: string,
      session: string,
      name: string,
      input: unknown,
    ) => {
      const allowed = capability.parse(name);
      return request(`miniapps/${id(miniappId)}/invoke`, invokeResult, "POST", {
        launch_id: launchId(session),
        capability: allowed,
        input: validateInput(allowed, input),
      });
    },
    adminList: (n = 1) =>
      request(`admin/miniapps?page=${page(n)}`, adminResult),
    install: (
      packageId: string,
      version?: string,
      enabled = true,
      grants?: string[],
    ) =>
      request(
        "admin/miniapps",
        z.object({ miniapp: adminResult.shape.miniapps.shape.data.element }),
        "POST",
        {
          package_id: id(packageId),
          ...(version
            ? { version: z.string().min(1).max(80).parse(version) }
            : {}),
          enabled,
          ...(grants ? { grants: z.array(capability).parse(grants) } : {}),
        },
      ),
    update: (
      miniappId: string,
      expectedVersion: number,
      enabled: boolean,
      grants: string[],
    ) =>
      request(
        `admin/miniapps/${id(miniappId)}`,
        z.object({ miniapp: adminResult.shape.miniapps.shape.data.element }),
        "PATCH",
        {
          expected_version: z
            .number()
            .int()
            .nonnegative()
            .parse(expectedVersion),
          enabled,
          grants: z.array(capability).parse(grants),
        },
      ),
  };
}
