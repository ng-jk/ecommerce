import { useAssistantSession } from "@portfolio/storefront";
import { usePlatformSession } from "../../platform_shell_screen";

export function usePlatformAssistant() {
  const { api, user, refresh } = usePlatformSession();
  return useAssistantSession({
    assistant: api.assistant,
    principalId: user?.id ?? null,
    onCompleted: async (result) => {
      if (result.executed_action?.startsWith("platform.auth.")) await refresh();
    },
  });
}
