import {
  ApiError,
  errorMessage,
  type Organization,
} from "@portfolio/api-client";
import { router } from "expo-router";
import { useState } from "react";
import { usePlatformSession } from "../../platform_shell_screen";

export function usePlatformOrganizationForm(initial?: Organization) {
  const { api } = usePlatformSession();
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setMessage("");
    setFieldErrors({});
    try {
      if (initial) {
        const result = await api.workspace.updateOrganization(initial.id, {
          name,
          expected_version: initial.version,
        });
        router.replace(`/platform/organizations/${result.organization.id}`);
      } else {
        const result = await api.workspace.createOrganization({ code, name });
        router.replace(`/platform/organizations/${result.organization.id}`);
      }
    } catch (error) {
      if (error instanceof ApiError) setFieldErrors(error.validation_error);
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return { code, setCode, name, setName, fieldErrors, message, busy, save };
}
