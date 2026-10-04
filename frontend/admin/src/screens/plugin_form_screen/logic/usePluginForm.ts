import {
  pluginFormValues,
  type PluginInstallation,
} from "@portfolio/merchant-plugins";
import { useStore } from "@portfolio/storefront";
import { router } from "expo-router";
import { useState } from "react";
import { ApiError } from "@portfolio/api-client";

export function usePluginForm(initial?: PluginInstallation) {
  const { plugins, run, busy, user } = useStore();
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);
  const [customerEnabled, setCustomerEnabled] = useState(
    initial?.customer_enabled ?? false,
  );
  const [maxCredit, setMaxCredit] = useState(
    String(initial?.max_credit ?? 100),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const save = () =>
    run(async () => {
      setFieldErrors({});
      try {
        const draft = pluginFormValues(enabled, customerEnabled, maxCredit);
        if (!user || user.role !== "admin")
          throw new Error("Administrator access required.");
        if (initial)
          await plugins.update(user.id, initial.id, initial.version, draft);
        else await plugins.install(user.id, draft);
        router.replace("/plugins");
      } catch (error) {
        if (error instanceof ApiError) setFieldErrors(error.validation_error);
        else if (
          error instanceof Error &&
          error.message.startsWith("Maximum credit")
        )
          setFieldErrors({ max_credit: [error.message] });
        throw error;
      }
    });
  return {
    enabled,
    setEnabled,
    customerEnabled,
    setCustomerEnabled,
    maxCredit,
    setMaxCredit,
    fieldErrors,
    busy,
    save,
  };
}
