import { Copy } from "@portfolio/storefront";
import { AdminPage } from "../../admin_shell_screen";
import { PluginForm } from "../../plugin_form_screen";
import { usePluginEdit } from "../logic/usePluginEdit";
export function PluginEditScreen() {
  const { user, plugin, label } = usePluginEdit();
  return (
    <AdminPage title="Configure plugin">
      {user?.role !== "admin" ? (
        <Copy>Administrator access required.</Copy>
      ) : plugin ? (
        <PluginForm
          key={`${plugin.id}.${plugin.version}`}
          initial={plugin}
          label={label}
        />
      ) : (
        <Copy>Loading plugin…</Copy>
      )}
    </AdminPage>
  );
}
