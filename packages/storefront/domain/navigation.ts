export type ScreenKind = "main" | "temp";
export type Screen = {
  id: string;
  kind: ScreenKind;
  fallback: string;
  controls: readonly string[];
};
export function backDestination(
  history: readonly Screen[],
  fallback: Screen,
): Screen {
  if (fallback.kind !== "main")
    throw new Error("The fallback must be a main screen.");
  return (
    [...history].reverse().find((screen) => screen.kind === "main") ?? fallback
  );
}
export function durableHistory(
  history: readonly Screen[],
  next: Screen,
): Screen[] {
  return next.kind === "main"
    ? [...history.filter((screen) => screen.kind === "main"), next]
    : history.filter((screen) => screen.kind === "main");
}
