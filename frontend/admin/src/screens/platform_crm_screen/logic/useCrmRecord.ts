import { errorMessage } from "@portfolio/api-client";
import { useCallback, useState } from "react";
import { usePlatformSession } from "../../platform_shell_screen";
import { usePlatformQuery } from "../../platform_workspace_screen";
import type { CrmKind, CrmRecord } from "./model";

type Detail = {
  record: CrmRecord;
  options?: { status: Record<string, string> };
};

export function useCrmRecord(
  organizationId: string,
  kind: CrmKind,
  recordId: string,
) {
  const { api, user } = usePlatformSession();
  const load = useCallback(async (): Promise<Detail> => {
    switch (kind) {
      case "companies":
        return {
          record: (await api.crm.company(organizationId, recordId)).company,
        };
      case "contacts":
        return {
          record: (await api.crm.contact(organizationId, recordId)).contact,
        };
      case "leads": {
        const detail = await api.crm.lead(organizationId, recordId);
        return { record: detail.lead, options: detail.options };
      }
    }
  }, [api, organizationId, kind, recordId]);
  const query = usePlatformQuery(!!user, load);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const convert = async () => {
    const record = query.result?.record;
    if (!record || kind !== "leads") return;
    setBusy(true);
    setActionError("");
    try {
      await api.crm.convertLead(organizationId, recordId, {
        expected_version: record.version,
      });
      query.retry();
    } catch (reason) {
      setActionError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  return { user, ...query, busy, actionError, convert };
}
