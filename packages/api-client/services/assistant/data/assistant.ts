import { z } from "zod";
import type { AssistantPort } from "../logic/types";
import type { StoragePort } from "../../contracts";
import { ApiError, user } from "../../contracts";
import type { createTransport } from "../../transport";

type Parameter = {
  type: string;
  properties?: Record<string, Parameter> | undefined;
  items?: Parameter | undefined;
};
const parameter: z.ZodType<Parameter> = z.lazy(() =>
  z
    .object({
      type: z.enum([
        "object",
        "array",
        "integer",
        "number",
        "boolean",
        "string",
      ]),
      properties: z.record(parameter).optional(),
      items: parameter.optional(),
      enum: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
      options: z.record(z.string()).optional(),
    })
    .passthrough(),
);

export const assistantReply = z.object({
  status: z.enum(["needs_input", "needs_confirmation", "completed"]),
  message: z.string(),
  conversation_id: z.string().uuid().optional(),
  conversation_version: z.number().int().nonnegative().optional(),
  available_actions: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      method: z.string(),
      path: z.string(),
      confirmation_required: z.boolean(),
      natural_language_confirmation_required: z.boolean(),
      allowed_roles: z.array(z.string()),
      parameters: z.record(z.unknown()),
    }),
  ),
  required_input: z.array(
    z.object({
      field: z.string(),
      type: z.enum([
        "object",
        "array",
        "integer",
        "number",
        "boolean",
        "string",
      ]),
      enum: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
      properties: z.record(parameter).optional(),
      options: z.record(z.string()).optional(),
    }),
  ),
  preview: z.union([z.record(z.unknown()), z.array(z.unknown())]).optional(),
  api_result: z.unknown().optional(),
  choices: z.unknown().optional(),
  executed_action: z.string().optional(),
});
const turn = z
  .object({
    message: z.string().min(1).max(2000).optional(),
    action: z.string().min(1).max(80).optional(),
    data: z.record(z.unknown()).optional(),
    conversation_id: z.string().uuid().optional(),
    conversation_version: z.number().int().nonnegative().optional(),
    confirm: z.boolean().optional(),
    discover: z.boolean().optional(),
  })
  .strict();
export function assistantAdapter(
  request: ReturnType<typeof createTransport>,
  storage: StoragePort,
  uuid: () => string,
  native = false,
): AssistantPort["assistant"] {
  return async (input, principal = null) => {
    const body = turn.parse(input);
    if (
      native &&
      (body.action === "login" || body.action === "register") &&
      !body.confirm
    )
      body.data = { ...body.data, device_name: "Expo assistant" };
    const partition =
      principal === null
        ? "guest"
        : z.number().int().positive().parse(principal);
    const storageKey = `assistant.receipt.${partition}`;
    let receipt: string;
    try {
      const stored = await storage.get(storageKey);
      receipt =
        stored === null ? (uuid() + uuid()).replaceAll("-", "") : stored;
      z.string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(receipt);
      if (stored === null) await storage.set(storageKey, receipt);
    } catch {
      throw new ApiError(
        "Cannot safely restore the assistant conversation. Restore local storage before retrying.",
        0,
        "invalid_body",
      );
    }
    const result = await request(
      "assistant",
      assistantReply,
      "POST",
      body,
      receipt,
      storage,
    );
    if (result.status === "completed") {
      if (
        result.executed_action === "auth.login" ||
        result.executed_action === "auth.register"
      ) {
        const auth = z
          .object({ user, token: z.string().min(1).optional() })
          .parse(result.api_result);
        if (native && auth.token) await storage.set("token", auth.token);
      } else if (result.executed_action === "auth.logout") {
        await storage.remove("token");
        await storage.clear?.();
      }
    }
    return result;
  };
}
