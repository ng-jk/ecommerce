import type { Address, StoragePort } from "@portfolio/api-client";
import type { CommerceClient } from "../../store";
export async function checkout(
  api: Pick<CommerceClient, "checkout">,
  storage: StoragePort,
  uuid: () => string,
  userId: number,
  address: Address,
  paymentMethod?: string,
): Promise<void> {
  const keyName = `checkout.${userId}`;
  let key = await storage.get(keyName);
  if (!key) {
    key = uuid();
    await storage.set(keyName, key);
  }
  if (paymentMethod === undefined) await api.checkout(key, address);
  else await api.checkout(key, address, paymentMethod);
  await storage.remove(keyName);
}
