import { ApiError, errorMessage, type ErpJournal } from "@portfolio/api-client";
import { router } from "expo-router";
import { useState } from "react";
import { usePlatformSession } from "../../platform_shell_screen";
import { erpPath } from "./model";

export function useErpTransition(
  organizationId: string,
  journal: ErpJournal,
  reload: () => void,
) {
  const { api } = usePlatformSession();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const run = async (kind: "post" | "reverse") => {
    setBusy(true);
    setMessage("");
    try {
      if (kind === "post") {
        await api.erp.postJournal(organizationId, journal.id, {
          expected_version: journal.version,
        });
        reload();
      } else {
        const result = await api.erp.reverseJournal(
          organizationId,
          journal.id,
          {
            expected_version: journal.version,
            effective_date: new Date().toISOString().slice(0, 10),
          },
        );
        router.replace(erpPath(organizationId, "journals", result.journal.id));
      }
    } catch (reason) {
      const detail =
        reason instanceof ApiError &&
        reason.validation_error.expected_version?.join(" ");
      setMessage(detail || errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  return { busy, message, run };
}
