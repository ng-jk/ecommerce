export interface MiniappSDK {
  ready: Promise<void>;
  request(
    capability:
      "catalog" | "product" | "cart.read" | "orders" | "plugin.loyalty.balance",
    input?: unknown,
  ): Promise<unknown>;
  catalog(page?: number): Promise<unknown>;
  product(id: number): Promise<unknown>;
  cart(): Promise<unknown>;
  orders(): Promise<unknown>;
  loyaltyBalance(): Promise<unknown>;
}
export function createMiniappSDK(parentOrigin?: string): MiniappSDK;
