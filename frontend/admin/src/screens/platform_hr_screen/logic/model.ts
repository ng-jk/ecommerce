export const hrBase = (organizationId: string) =>
  `/platform/organizations/${organizationId}/hr` as const;
export const hrPath = (organizationId: string, suffix: string) =>
  `${hrBase(organizationId)}/${suffix}` as const;
