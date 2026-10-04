import type { Product } from "@portfolio/api-client";
import type { CommerceClient } from "@portfolio/storefront/services/store";

type AdminApi = Pick<
  CommerceClient,
  "adminProducts" | "adminProduct" | "saveProduct" | "deleteProduct"
>;

export const getAdminProducts = (
  api: AdminApi,
  page?: number,
  category?: string,
) => api.adminProducts(page, category);

export const getAdminProduct = (api: AdminApi, id: string) =>
  api.adminProduct(id);

export const saveAdminProduct = (api: AdminApi, product: Partial<Product>) =>
  api.saveProduct(product);

export const deleteAdminProduct = (
  api: AdminApi,
  id: number,
  version: number,
) => api.deleteProduct(id, version);
