import { useCallback, useState } from "react";
import { usePlatformSession } from "../../platform_shell_screen";
import { usePlatformQuery } from "../../platform_workspace_screen";
import type { GrowthKind, GrowthRecord } from "./model";

type Directory = {
  data: GrowthRecord[];
  meta: {
    current_page: number;
    last_page: number;
    total: number;
    per_page: number;
    options?: {
      status?: Record<string, string>;
      outcome?: Record<string, string>;
      type?: Record<string, string>;
    };
  };
};

export function useGrowthDirectory(
  organizationId: string,
  kind: GrowthKind,
  initialPipelineId = "",
  dealId = "",
) {
  const { api, user } = usePlatformSession();
  const [page, setPage] = useState(1);
  const [pipelineId, setPipelineId] = useState(initialPipelineId);
  const [filter, setFilter] = useState("");
  const load = useCallback(async (): Promise<Directory> => {
    switch (kind) {
      case "pipelines":
        return api.crm.pipelines(organizationId, page);
      case "stages":
        return pipelineId
          ? api.crm.stages(organizationId, pipelineId, page, filter)
          : {
              data: [],
              meta: { current_page: 1, last_page: 1, total: 0, per_page: 20 },
            };
      case "deals":
        return api.crm.deals(organizationId, page, pipelineId, filter);
      case "activities":
        return api.crm.activities(organizationId, page, dealId, filter);
    }
  }, [api, organizationId, kind, page, pipelineId, dealId, filter]);
  const query = usePlatformQuery(!!user, load);
  const options = query.result?.meta.options;
  const choices =
    kind === "stages"
      ? options?.outcome
      : kind === "deals"
        ? options?.status
        : kind === "activities"
          ? options?.type
          : undefined;
  const cycleFilter = () => {
    const keys = Object.keys(choices ?? {});
    setFilter(keys[keys.indexOf(filter) + 1] ?? "");
    setPage(1);
  };
  const changePipeline = (value: string) => {
    setPipelineId(value);
    setPage(1);
  };
  return {
    user,
    page,
    setPage,
    pipelineId,
    changePipeline,
    filter,
    choices,
    cycleFilter,
    ...query,
  };
}
