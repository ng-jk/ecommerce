import type { FailureKind } from "../../contracts";
export function classify(status: number): FailureKind {
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "missing";
  if (status === 409) return "conflict";
  if (status === 422) return "validation";
  if (status === 429) return "throttled";
  if (status === 408) return "timeout";
  return status >= 500 ? "server" : "unexpected";
}
export function retryDelay(
  attempt: number,
  retryAfter: string | null,
  now = Date.now(),
  random = Math.random(),
): number {
  const numeric = Number(retryAfter);
  const specified =
    retryAfter === null
      ? 0
      : Number.isFinite(numeric)
        ? numeric * 1000
        : Date.parse(retryAfter) - now;
  return Math.min(
    5000,
    Math.max(
      0,
      Number.isFinite(specified) ? specified : 0,
      200 * 2 ** attempt + random * 100,
    ),
  );
}
