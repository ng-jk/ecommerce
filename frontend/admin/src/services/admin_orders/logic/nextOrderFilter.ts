export function nextOrderFilter(
  options: Record<string, string>,
  status: string,
) {
  const values = Object.keys(options);
  return values[values.indexOf(status) + 1] ?? "";
}
