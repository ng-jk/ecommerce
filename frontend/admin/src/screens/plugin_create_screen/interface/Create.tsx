import { Copy } from "@portfolio/storefront";
import { AdminPage } from "../../admin_shell_screen";
import { PluginForm } from "../../plugin_form_screen";
import { usePluginCreate } from "../logic/usePluginCreate";
export function PluginCreateScreen() {
  const { user, label } = usePluginCreate();
  return (
    <AdminPage title="Install plugin">
      {user?.role !== "admin" ? (
        <Copy>Administrator access required.</Copy>
      ) : label ? (
        <PluginForm label={label} />
      ) : (
        <Copy>Loading plugin options…</Copy>
      )}
    </AdminPage>
  );
}
