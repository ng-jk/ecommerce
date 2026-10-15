import {
  ApiError,
  errorMessage,
  type InsightColumn,
} from "@portfolio/api-client";
export const insightsPath = (org: string, suffix = "") =>
  `/platform/organizations/${org}/insights${suffix ? `/${suffix}` : ""}` as const;
export function parseColumns(text: string): InsightColumn[] {
  const columns = text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const [name = "", type = "", extra] = line.trim().split(":");
      if (
        extra !== undefined ||
        !/^[a-z][a-z0-9_]{0,39}$/.test(name) ||
        !["string", "integer", "boolean"].includes(type)
      )
        throw new Error(
          "Use column_name:string, column_name:integer, or column_name:boolean on each line.",
        );
      return { name, type: type as InsightColumn["type"] };
    });
  if (
    !columns.length ||
    columns.length > 20 ||
    new Set(columns.map((column) => column.name)).size !== columns.length
  )
    throw new Error("Use one to twenty uniquely named columns.");
  return columns;
}
export function parseCsv(
  text: string,
  schema: InsightColumn[],
): Record<string, string | number | boolean>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closed = false;
  for (let i = 0; i <= text.length; i++) {
    const char = text[i] ?? "\n";
    if (quoted) {
      if (i === text.length) throw new Error("A quoted cell is unfinished.");
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else cell += char;
    } else if (char === '"' && cell === "" && !closed) quoted = true;
    else if (char === "," || char === "\n" || char === "\r") {
      row.push(cell);
      cell = "";
      closed = false;
      if (char !== ",") {
        if (row.some((value) => value !== "")) rows.push(row);
        row = [];
        if (char === "\r" && text[i + 1] === "\n") i++;
      }
    } else {
      if (closed || char === '"')
        throw new Error("Invalid text after a quoted cell.");
      cell += char;
    }
  }
  const header = rows.shift();
  if (
    !header ||
    header.length !== schema.length ||
    header.some((name, i) => name !== schema[i]?.name)
  )
    throw new Error("CSV headers must exactly match the dataset column order.");
  if (rows.length > 500) throw new Error("Import at most 500 rows.");
  return rows.map((values) => {
    if (values.length !== schema.length)
      throw new Error("Every CSV row must include every column.");
    return Object.fromEntries(
      schema.map((column, i) => {
        const value = values[i]!;
        if (column.type === "integer") {
          if (
            !/^-?(0|[1-9][0-9]*)$/.test(value) ||
            Math.abs(Number(value)) > 1000000000
          )
            throw new Error(
              `${column.name} requires an integer between -1000000000 and 1000000000.`,
            );
          return [column.name, Number(value)];
        }
        if (column.type === "boolean") {
          if (!["true", "false"].includes(value))
            throw new Error(`${column.name} requires true or false.`);
          return [column.name, value === "true"];
        }
        if (value.length > 80)
          throw new Error(`${column.name} accepts at most 80 characters.`);
        return [column.name, value];
      }),
    );
  });
}

export function insightsError(reason: unknown): string {
  return reason instanceof ApiError
    ? [
        errorMessage(reason),
        ...Object.entries(reason.validation_error).flatMap(
          ([field, messages]) =>
            messages.map((message) => `${field}: ${message}`),
        ),
      ].join("\n")
    : errorMessage(reason);
}
