import type { AssistantTool } from "@portfolio/api-client/services/assistant";
import type { PluginDraft } from "./types";

// Bundled extension registry. Installing a record activates server-authorized behavior;
// this registry does not load or execute merchant supplied code.
export const pluginRegistry = [
  { id: "loyalty", balanceTool: "loyaltyBalance" },
] as const;
export function pluginAvailable(
  actions: AssistantTool[],
  role: string,
): boolean {
  return actions.some(
    (action) =>
      action.name === pluginRegistry[0].balanceTool &&
      action.allowed_roles.includes(role),
  );
}
export function pluginFormValues(
  enabled: boolean,
  customerEnabled: boolean,
  maxCreditText: string,
): PluginDraft {
  const max_credit = Number(maxCreditText);
  if (!Number.isInteger(max_credit) || max_credit < 1 || max_credit > 10000)
    throw new Error("Maximum credit must be a whole number from 1 to 10,000.");
  return { enabled, customer_enabled: customerEnabled, max_credit };
}
