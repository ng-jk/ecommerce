import {
  ApiError,
  errorMessage,
  type LendingApplication,
} from "@portfolio/api-client";
import { router } from "expo-router";
import { useState } from "react";
import { usePlatformSession } from "../../platform_shell_screen";
import { lendingPath } from "./model";

export function useLendingAction(organizationId: string, reload?: () => void) {
  const { api } = usePlatformSession();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const run = async (action: () => Promise<unknown>, destination?: string) => {
    setBusy(true);
    setMessage("");
    setFieldErrors({});
    try {
      await action();
      if (destination) router.replace(destination);
      else reload?.();
    } catch (reason) {
      if (reason instanceof ApiError) setFieldErrors(reason.validation_error);
      setMessage(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  const submit = (record: LendingApplication) =>
    run(() =>
      api.lending.submitApplication(organizationId, record.id, {
        expected_version: record.version,
      }),
    );
  const withdraw = (record: LendingApplication) =>
    run(() =>
      api.lending.withdrawApplication(organizationId, record.id, {
        expected_version: record.version,
      }),
    );
  const decide = (
    record: LendingApplication,
    decision: "approved" | "rejected",
    decisionNote: string,
  ) =>
    run(
      () =>
        api.lending.decideReview(organizationId, record.id, {
          expected_version: record.version,
          decision,
          decision_note: decisionNote,
        }),
      lendingPath(organizationId, "reviews", record.id),
    );
  return { busy, message, fieldErrors, run, submit, withdraw, decide };
}
