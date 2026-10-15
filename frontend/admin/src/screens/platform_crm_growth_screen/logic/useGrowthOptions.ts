import { useCallback } from "react";
import { usePlatformSession } from "../../platform_shell_screen";
import { usePlatformQuery } from "../../platform_workspace_screen";
import type { GrowthKind } from "./model";

export function useGrowthOptions(
  organizationId: string,
  kind: GrowthKind,
  pipelineId: string,
) {
  const { api, user } = usePlatformSession();
  const load = useCallback(async (): Promise<Record<string, string>> => {
    if (kind === "stages" && pipelineId) {
      return (await api.crm.stages(organizationId, pipelineId, 1)).meta.options
        .outcome;
    }
    if (kind === "activities") {
      return (await api.crm.activities(organizationId, 1)).meta.options.type;
    }
    return {};
  }, [api, organizationId, kind, pipelineId]);
  return usePlatformQuery(!!user && (kind !== "stages" || !!pipelineId), load);
}
