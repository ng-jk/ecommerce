import { pluginAvailable } from "@portfolio/merchant-plugins";
import type { AssistantReply } from "@portfolio/api-client/services/assistant";
export function loyaltyAvailable(reply: AssistantReply, role: string): boolean {
  return pluginAvailable(reply.available_actions, role);
}
