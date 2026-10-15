import { useStore } from "@portfolio/storefront";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

export function useOrganizationsList() {
  const { api, run, user, shop } = useStore();
  const scope = `${shop}.${user?.id ?? "guest"}`;
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [retry, setRetry] = useState(0);
  const requestScope = `${scope}.${retry}`;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState<{
    scope: string;
    result: Awaited<ReturnType<typeof api.platformWorkspace.organizations>>;
  } | null>(null);
  useFocusEffect(
    useCallback(() => {
      setLoaded(null);
      setFailed(false);
      if (!user) return;
      let active = true;
      void run(async () => {
        const result = await api.platformWorkspace.organizations(page, status);
        if (active) setLoaded({ scope: requestScope, result });
      }).then((ok) => {
        if (active && !ok) setFailed(true);
      });
      return () => {
        active = false;
      };
    }, [api, run, user, requestScope, page, status]),
  );
  const result = loaded?.scope === requestScope ? loaded.result : null;
  const statuses = result ? Object.keys(result.meta.options.status) : [];
  const cycleStatus = () => {
    const index = statuses.indexOf(status);
    setStatus(statuses[index + 1] ?? "");
    setPage(1);
  };
  return {
    user,
    result,
    page,
    setPage,
    status,
    cycleStatus,
    failed,
    retry: () => setRetry((value) => value + 1),
  };
}
