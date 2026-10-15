export const erpPath = (
  organizationId: string,
  collection = "",
  id?: number | string,
) =>
  `/platform/organizations/${organizationId}/erp${collection ? `/${collection}` : ""}${id === undefined ? "" : `/${id}`}`;
