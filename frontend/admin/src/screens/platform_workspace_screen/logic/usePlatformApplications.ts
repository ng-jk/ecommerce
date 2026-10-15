import { useCallback, useState } from "react";
import { errorMessage } from "@portfolio/api-client";
import { usePlatformSession } from "../../platform_shell_screen";
import { usePlatformQuery } from "./usePlatformQuery";

export function usePlatformApplications(id: string) {
  const { api, user } = usePlatformSession();
  const [catalogPage, setCatalogPage] = useState(1);
  const [busyKey, setBusyKey] = useState("");
  const [mutationError, setMutationError] = useState("");
  const catalog = usePlatformQuery(
    !!user,
    useCallback(
      () => api.workspace.catalog(id, catalogPage),
      [api, id, catalogPage],
    ),
  );
  async function change(
    key: string,
    state: "installed" | "disabled" | null,
    version: number | null,
  ) {
    if (busyKey) return;
    setBusyKey(key);
    setMutationError("");
    try {
      if (state === null)
        await api.workspace.installApplication(id, key, {
          expected_version: 0,
        });
      else if (state === "installed")
        await api.workspace.disableApplication(id, key, {
          expected_version: version ?? 0,
        });
      else
        await api.workspace.reenableApplication(id, key, {
          expected_version: version ?? 0,
        });
      catalog.retry();
    } catch (reason) {
      setMutationError(errorMessage(reason));
    } finally {
      setBusyKey("");
    }
  }
  return {
    user,
    catalog,
    catalogPage,
    setCatalogPage,
    busyKey,
    mutationError,
    change,
  };
}
