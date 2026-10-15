export const builderPath = (organizationId: string, pageId?: number | string) =>
  `/platform/organizations/${organizationId}/builder/pages${pageId === undefined ? "" : `/${pageId}`}`;
