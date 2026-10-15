export const lendingPath = (
  organizationId: string,
  collection = "",
  id?: number | string,
) =>
  `/platform/organizations/${organizationId}/lending${collection ? `/${collection}` : ""}${id === undefined ? "" : `/${id}`}`;

export function statusLabel(
  options: Record<string, string>,
  status: string,
): string {
  return options[status] ?? "Unavailable status";
}

export function nextOption(
  options: Record<string, string>,
  current: string,
): string {
  const keys = Object.keys(options);
  return keys[(keys.indexOf(current) + 1) % keys.length] ?? "";
}

export const numericInput = (value: string): number =>
  value.trim() === "" ? Number.NaN : Number(value);
