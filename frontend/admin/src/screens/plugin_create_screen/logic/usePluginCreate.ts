import { useStore } from "@portfolio/storefront";
import { useEffect, useState } from "react";
export function usePluginCreate() {
  const { plugins, run, user, shop } = useStore();
  const scope = `${shop}.${user?.id ?? "guest"}`;
  const [loaded, setLoaded] = useState<{ scope: string; label: string } | null>(
    null,
  );
  useEffect(() => {
    if (user?.role !== "admin") return;
    let active = true;
    void run(async () => {
      const result = await plugins.list();
      const label = result.options.plugin_id.loyalty;
      if (active && label) setLoaded({ scope, label });
    });
    return () => {
      active = false;
    };
  }, [plugins, run, user?.role, scope]);
  return { user, label: loaded?.scope === scope ? loaded.label : null };
}
