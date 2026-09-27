import type {
  AssistantField,
  AssistantReply,
  AssistantTurn,
} from "@portfolio/api-client/domain/assistant";

export function continuation(reply: AssistantReply | null): AssistantTurn {
  if (!reply?.conversation_id || reply.conversation_version === undefined)
    return {};
  return {
    conversation_id: reply.conversation_id,
    conversation_version: reply.conversation_version,
  };
}
export function confirmTurn(reply: AssistantReply): AssistantTurn {
  if (
    reply.status !== "needs_confirmation" ||
    !reply.conversation_id ||
    reply.conversation_version === undefined
  )
    throw new Error("Review a current preview before confirming.");
  return { ...continuation(reply), confirm: true };
}
export function inputFields(fields: AssistantField[]): AssistantField[] {
  return fields.flatMap((field) => {
    if (field.type !== "object" || !field.properties) return [field];
    return inputFields(
      Object.entries(field.properties).map(([key, value]) => {
        if (
          typeof value !== "object" ||
          value === null ||
          !("type" in value) ||
          typeof value.type !== "string"
        )
          throw new Error("Unsupported assistant field metadata.");
        return {
          field: `${field.field}.${key}`,
          type: value.type,
          ...("properties" in value &&
          typeof value.properties === "object" &&
          value.properties !== null
            ? {
                properties: Object.fromEntries(
                  Object.entries(value.properties),
                ),
              }
            : {}),
          ...("enum" in value && Array.isArray(value.enum)
            ? {
                enum: value.enum.filter(
                  (item): item is string | number | boolean =>
                    ["string", "number", "boolean"].includes(typeof item),
                ),
              }
            : {}),
          ...("options" in value &&
          typeof value.options === "object" &&
          value.options !== null
            ? {
                options: Object.fromEntries(
                  Object.entries(value.options).filter(
                    (entry): entry is [string, string] =>
                      typeof entry[1] === "string",
                  ),
                ),
              }
            : {}),
        };
      }),
    );
  });
}
export function fieldData(
  field: AssistantField,
  text: string,
): Record<string, unknown> {
  let value: unknown = text;
  if (field.type === "integer" || field.type === "number") {
    value = Number(text);
    if (
      text.trim() === "" ||
      !Number.isFinite(value) ||
      (field.type === "integer" && !Number.isInteger(value))
    )
      throw new Error("Enter a valid " + field.type + ".");
  } else if (field.type === "boolean") {
    if (text !== "true" && text !== "false")
      throw new Error("Choose true or false.");
    value = text === "true";
  } else if (field.type === "array" || field.type === "object") {
    value = JSON.parse(text);
    if (
      (field.type === "array" && !Array.isArray(value)) ||
      (field.type === "object" &&
        (value === null || typeof value !== "object" || Array.isArray(value)))
    )
      throw new Error("Enter a valid " + field.type + ".");
  }
  if (
    field.enum &&
    (!(
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) ||
      !field.enum.includes(value))
  )
    throw new Error("Choose an available option.");
  const path = field.field.replace(/^data\./, "").split(".");
  if (
    path.some((part) =>
      ["__proto__", "constructor", "prototype"].includes(part),
    )
  )
    throw new Error("Unsupported field path.");
  return path.reduceRight<Record<string, unknown>>(
    (nested, part, index) => ({
      [part]: index === path.length - 1 ? value : nested,
    }),
    {},
  );
}
export function nextChoice(options: string[], current: string): string {
  return options[(options.indexOf(current) + 1) % options.length] ?? "";
}
export function displayRows(value: unknown, prefix = ""): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== "object")
    return [prefix ? `${prefix}: ${String(value)}` : String(value)];
  return Object.entries(value).flatMap(([key, entry]) => {
    if (/password|token|receipt/i.test(key)) return [];
    return displayRows(entry, prefix ? `${prefix} / ${key}` : key);
  });
}
