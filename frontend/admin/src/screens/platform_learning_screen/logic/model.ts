export const learningBase = (organizationId: string) =>
  `/platform/organizations/${organizationId}/learning` as const;
export const learningPath = (organizationId: string, suffix: string) =>
  `${learningBase(organizationId)}/${suffix}` as const;
