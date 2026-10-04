import type { CommerceClient } from "@portfolio/storefront/services/store";

type AdminApi = Pick<CommerceClient, "adminOrders" | "advanceOrder">;

export const getAdminOrders = (api: AdminApi, page: number, status: string) =>
  api.adminOrders(page, status);

export const advanceAdminOrder = (api: AdminApi, id: number, next: string) =>
  api.advanceOrder(id, next);
