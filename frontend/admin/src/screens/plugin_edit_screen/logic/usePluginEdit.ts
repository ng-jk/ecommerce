import { useStore } from "@portfolio/storefront";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import type { PluginInstallation } from "@portfolio/merchant-plugins";
import { useAdminShop } from "../../admin_shell_screen";
export function usePluginEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { plugins, run, user } = useStore();
  const { shop } = useAdminShop();
  const scope = `${shop}.${user?.id ?? "guest"}.${id}`;
  const [loaded, setLoaded] = useState<{
    scope: string;
    plugin: PluginInstallation;
    label: string;
  } | null>(null);
  useEffect(() => {
    if (user?.role !== "admin") return;
    const value = Number(id);
    if (!Number.isInteger(value) || value < 1) return;
    let active = true;
    void run(async () => {
      const result = await plugins.detail(value);
      if (active)
        setLoaded({
          scope,
          plugin: result.plugin,
          label:
            result.options.plugin_id[result.plugin.plugin_id] ??
            result.plugin.plugin_id,
        });
    });
    return () => {
      active = false;
    };
  }, [id, plugins, run, user?.role, scope]);
  return {
    user,
    plugin: loaded?.scope === scope ? loaded.plugin : null,
    label: loaded?.scope === scope ? loaded.label : "",
  };
}
