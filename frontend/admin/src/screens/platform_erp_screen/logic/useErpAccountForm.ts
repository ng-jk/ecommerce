import { ApiError, errorMessage, type ErpAccount } from "@portfolio/api-client";
import { router } from "expo-router";
import { useState } from "react";
import { usePlatformSession } from "../../platform_shell_screen";
import { erpPath } from "./model";

export function useErpAccountForm(
  organizationId: string,
  initial?: ErpAccount,
) {
  const { api } = usePlatformSession();
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState(initial?.type ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const cycleType = (options: Record<string, string>) => {
    const keys = Object.keys(options);
    setType(keys[(keys.indexOf(type) + 1) % keys.length] ?? "");
  };
  const save = async () => {
    setBusy(true);
    setMessage("");
    setFieldErrors({});
    try {
      const result = initial
        ? await api.erp.updateAccount(organizationId, initial.id, {
            name,
            expected_version: initial.version,
          })
        : await api.erp.createAccount(organizationId, { code, name, type });
      router.replace(erpPath(organizationId, "accounts", result.account.id));
    } catch (reason) {
      if (reason instanceof ApiError) setFieldErrors(reason.validation_error);
      setMessage(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  return {
    code,
    setCode,
    name,
    setName,
    type,
    cycleType,
    busy,
    message,
    fieldErrors,
    save,
  };
}
