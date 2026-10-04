import { useStore } from "@portfolio/storefront";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import type { PluginInstallation } from "@portfolio/merchant-plugins";

export function usePluginsList() {
  const { plugins, run, user, shop } = useStore();
  const scope = `${shop}.${user?.id ?? "guest"}`;
  const [loaded, setLoaded] = useState<{
    scope: string;
    items: PluginInstallation[];
    last: number;
    labels: Record<string, string>;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [enabledOnly, setEnabledOnly] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setLoaded(null);
      if (user?.role !== "admin") return;
      let active = true;
      void run(async () => {
        const result = await plugins.list(page, enabledOnly ? true : undefined);
        if (active)
          setLoaded({
            scope,
            items: result.plugins.data,
            last: result.plugins.meta.last_page,
            labels: result.options.plugin_id,
          });
      });
      return () => {
        active = false;
      };
    }, [plugins, run, scope, user?.role, page, enabledOnly]),
  );
  const current = loaded?.scope === scope ? loaded : null;
  return {
    user,
    items: current?.items ?? [],
    page,
    setPage,
    last: current?.last ?? 1,
    enabledOnly,
    setEnabledOnly,
    labels: current?.labels ?? {},
  };
}
