import { useStore } from "@portfolio/storefront";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

export function useOrganizationApplications(id: string) {
  const { api, run, user, shop } = useStore();
  const scope = `${shop}.${user?.id ?? "guest"}.${id}`;
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const requestScope = `${scope}.${retry}`;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState<{
    scope: string;
    result: Awaited<ReturnType<typeof api.platformWorkspace.applications>>;
  } | null>(null);
  useFocusEffect(useCallback(() => {
    setLoaded(null);
    setFailed(false);
    if (!user) return;
    let active = true;
    void run(async () => {
      const result = await api.platformWorkspace.applications(id, page);
      if (active) setLoaded({ scope: requestScope, result });
    }).then((ok) => { if (active && !ok) setFailed(true); });
    return () => { active = false; };
  }, [api, run, user, requestScope, id, page]));
  return { user, result: loaded?.scope === requestScope ? loaded.result : null, page, setPage, failed, retry: () => setRetry((value) => value + 1) };
}
