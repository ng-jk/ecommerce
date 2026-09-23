import type { Address,StoragePort } from "@portfolio/api-client/domain/types";
import type { CommerceClient } from "./ports";
export async function checkout(
  api: Pick<CommerceClient, "checkout">,
  storage: StoragePort,
  uuid: () => string,
  userId: number,
  address: Address,
): Promise<void> {
  const keyName = `checkout.${userId}`;
  let key = await storage.get(keyName);
  if (!key) {
    key = uuid();
    await storage.set(keyName, key);
  }
  await api.checkout(key, address);
  await storage.remove(keyName);
}
