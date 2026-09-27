export type AssistantField = {
  field: string;
  type: string;
  enum?: (string | number | boolean)[] | undefined;
  properties?: Record<string, unknown> | undefined;
  options?: Record<string, string> | undefined;
};
export type AssistantTool = {
  name: string;
  description: string;
  method: string;
  path: string;
  confirmation_required: boolean;
  natural_language_confirmation_required: boolean;
  allowed_roles: string[];
  parameters: Record<string, unknown>;
};
export type AssistantTurn = {
  message?: string;
  action?: string;
  data?: Record<string, unknown>;
  conversation_id?: string;
  conversation_version?: number;
  confirm?: boolean;
  discover?: boolean;
};
export type AssistantReply = {
  status: "needs_input" | "needs_confirmation" | "completed";
  message: string;
  conversation_id?: string | undefined;
  conversation_version?: number | undefined;
  available_actions: AssistantTool[];
  required_input: AssistantField[];
  preview?: Record<string, unknown> | unknown[] | undefined;
  api_result?: unknown;
  executed_action?: string | undefined;
  choices?: unknown;
};
export interface AssistantPort {
  assistant(
    turn: AssistantTurn,
    principal?: number | null,
  ): Promise<AssistantReply>;
}
