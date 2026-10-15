import { ApiError, errorMessage } from "@portfolio/api-client";
import { useCallback, useState } from "react";
import { usePlatformSession } from "../../platform_shell_screen";
import { usePlatformQuery } from "../../platform_workspace_screen";
import type { GrowthKind, GrowthRecord } from "./model";

type Detail = {
  record: GrowthRecord;
  options?: {
    status?: Record<string, string>;
    outcome?: Record<string, string>;
    type?: Record<string, string>;
  };
};

export function useGrowthRecord(
  organizationId: string,
  kind: GrowthKind,
  recordId: string,
) {
  const { api, user } = usePlatformSession();
  const load = useCallback(async (): Promise<Detail> => {
    switch (kind) {
      case "pipelines":
        return {
          record: (await api.crm.pipeline(organizationId, recordId)).pipeline,
        };
      case "stages": {
        const detail = await api.crm.stage(organizationId, recordId);
        return { record: detail.stage, options: detail.options };
      }
      case "deals": {
        const detail = await api.crm.deal(organizationId, recordId);
        return { record: detail.deal, options: detail.options };
      }
      case "activities": {
        const detail = await api.crm.activity(organizationId, recordId);
        return { record: detail.activity, options: detail.options };
      }
    }
  }, [api, organizationId, kind, recordId]);
  const query = usePlatformQuery(!!user, load);
  const [stageId, setStageId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const advance = async () => {
    const record = query.result?.record;
    if (!record || !("stage_id" in record)) return;
    const parsed = Number(stageId);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      setFieldErrors({ stage_id: ["Enter a valid next stage ID."] });
      return;
    }
    setBusy(true);
    setMessage("");
    setFieldErrors({});
    try {
      await api.crm.advanceDeal(organizationId, recordId, {
        stage_id: parsed,
        expected_version: record.version,
      });
      setStageId("");
      query.retry();
    } catch (reason) {
      if (reason instanceof ApiError) setFieldErrors(reason.validation_error);
      setMessage(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  return {
    user,
    ...query,
    stageId,
    setStageId,
    busy,
    message,
    fieldErrors,
    advance,
  };
}
