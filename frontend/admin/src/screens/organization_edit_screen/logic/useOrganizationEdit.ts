import { useStore } from "@portfolio/storefront";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

export function useOrganizationEdit(id: string) {
  const { api, run, user, shop } = useStore();
  const scope = `${shop}.${user?.id ?? "guest"}.${id}`;
  const [retry, setRetry] = useState(0);
  const requestScope = `${scope}.${retry}`;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState<{ scope: string; detail: Awaited<ReturnType<typeof api.platformWorkspace.organization>> } | null>(null);
  useFocusEffect(useCallback(() => {
    setLoaded(null);
    setFailed(false);
    if (!user) return;
    let active = true;
    void run(async () => {
      const detail = await api.platformWorkspace.organization(id);
      if (active) setLoaded({ scope: requestScope, detail });
    }).then((ok) => { if (active && !ok) setFailed(true); });
    return () => { active = false; };
  }, [api, run, user, id, requestScope]));
  return { user, detail: loaded?.scope === requestScope ? loaded.detail : null, failed, retry: () => setRetry((value) => value + 1) };
}
