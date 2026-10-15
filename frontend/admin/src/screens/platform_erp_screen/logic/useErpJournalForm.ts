import { ApiError, errorMessage, type ErpJournal } from "@portfolio/api-client";
import { router } from "expo-router";
import { useState } from "react";
import { usePlatformSession } from "../../platform_shell_screen";
import { erpPath } from "./model";

export function useErpJournalForm(
  organizationId: string,
  initial?: ErpJournal,
) {
  const { api } = usePlatformSession();
  const [description, setDescription] = useState(initial?.description ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "USD");
  const [debitAccountId, setDebitAccountId] = useState(
    String(initial?.lines[0]?.account_id ?? ""),
  );
  const [creditAccountId, setCreditAccountId] = useState(
    String(initial?.lines[1]?.account_id ?? ""),
  );
  const [amount, setAmount] = useState(String(initial?.total_minor ?? ""));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const save = async () => {
    setBusy(true);
    setMessage("");
    setFieldErrors({});
    try {
      const debit = Number(debitAccountId);
      const credit = Number(creditAccountId);
      const minor = Number(amount);
      if (
        ![debitAccountId, creditAccountId, amount].every((value) =>
          /^[1-9][0-9]*$/.test(value),
        ) ||
        ![debit, credit, minor].every(Number.isSafeInteger) ||
        debit < 1 ||
        credit < 1 ||
        minor < 1
      ) {
        setFieldErrors({
          lines: [
            "Enter two account IDs and a positive integer minor-unit amount.",
          ],
        });
        return;
      }
      const input = {
        effective_date:
          initial?.effective_date ?? new Date().toISOString().slice(0, 10),
        description,
        currency,
        lines: [
          { account_id: debit, debit_minor: minor, credit_minor: 0 },
          { account_id: credit, debit_minor: 0, credit_minor: minor },
        ],
      };
      const result = initial
        ? await api.erp.updateJournal(organizationId, initial.id, {
            ...input,
            expected_version: initial.version,
          })
        : await api.erp.createJournal(organizationId, input);
      router.replace(erpPath(organizationId, "journals", result.journal.id));
    } catch (reason) {
      if (reason instanceof ApiError) setFieldErrors(reason.validation_error);
      setMessage(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  return {
    description,
    setDescription,
    currency,
    setCurrency,
    debitAccountId,
    setDebitAccountId,
    creditAccountId,
    setCreditAccountId,
    amount,
    setAmount,
    busy,
    message,
    fieldErrors,
    save,
  };
}
