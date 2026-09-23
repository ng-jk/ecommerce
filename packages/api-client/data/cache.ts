import { z } from "zod";
import type { StoragePort } from "../domain/types";
const entry = z.object({ expires: z.number(), value: z.unknown() });
export class Cache {
  constructor(
    private storage: StoragePort,
    private scope: string,
    private now: () => number = Date.now,
  ) {}
  private key(resource: string): string {
    return `commerce.v1.${this.scope}.${resource}`;
  }
  async read<T>(
    resource: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<T | null> {
    try {
      const raw = await this.storage.get(this.key(resource));
      if (!raw) return null;
      const cached = entry.parse(JSON.parse(raw));
      if (cached.expires <= this.now()) {
        await this.storage.remove(this.key(resource));
        return null;
      }
      return schema.parse(cached.value);
    } catch {
      return null;
    }
  }
  async write(resource: string, value: unknown, ttl = 30000): Promise<void> {
    try {
      const serialized = JSON.stringify({ expires: this.now() + ttl, value });
      if (serialized.length <= 100000)
        await this.storage.set(this.key(resource), serialized);
    } catch {
      /* Cache storage is optional; authoritative requests still work. */
    }
  }
}
export function memoryStorage(): StoragePort {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => {
      if (values.size >= 100 && !values.has(key)) {
        const oldest = [...values.keys()].find((value) =>
          value.startsWith("commerce.v1."),
        );
        if (!oldest) throw new Error("Pending action storage is full.");
        values.delete(oldest);
      }
      values.set(key, value);
    },
    clear: async () => {
      values.clear();
    },
    remove: async (key) => {
      values.delete(key);
    },
  };
}
