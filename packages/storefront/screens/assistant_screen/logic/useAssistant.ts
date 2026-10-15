import { useAssistantSession } from "./useAssistantSession";
import { useStore } from "../../store_shell_screen";

export function useAssistant() {
  const { api, user, refreshSession, refreshCart } = useStore();
  return useAssistantSession({
    assistant: api.assistant,
    principalId: user?.id ?? null,
    onCompleted: async (result) => {
      if (result.executed_action?.startsWith("auth.")) await refreshSession();
      else if (
        result.executed_action === "cart.update" ||
        result.executed_action === "checkout"
      )
        await refreshCart();
    },
  });
}
