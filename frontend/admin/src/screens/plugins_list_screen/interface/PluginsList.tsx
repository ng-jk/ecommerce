import { Button, Copy, Panel } from "@portfolio/storefront";
import { router } from "expo-router";
import { AdminPage } from "../../admin_shell_screen";
import { usePluginsList } from "../logic/usePluginsList";
export function PluginsListScreen() {
  const model = usePluginsList();
  return (
    <AdminPage title="Plugins">
      <Button title="Dashboard" onPress={() => router.replace("/")} />
      {model.user?.role === "admin" ? (
        <>
          <Button
            title={`Install ${model.labels.loyalty ?? "plugin"}`}
            disabled={
              model.enabledOnly ||
              model.page !== 1 ||
              model.items.some((item) => item.plugin_id === "loyalty")
            }
            onPress={() => router.push("/plugins/create")}
          />
          <Button
            title={`Enabled only: ${model.enabledOnly ? "Yes" : "No"}`}
            onPress={() => {
              model.setPage(1);
              model.setEnabledOnly(!model.enabledOnly);
            }}
          />
          {model.items.length === 0 && <Copy>No plugins on this page.</Copy>}
          {model.items.map((item) => (
            <Panel key={item.id}>
              <Copy>
                {model.labels[item.plugin_id] ?? item.plugin_id} ·{" "}
                {item.enabled ? "Enabled" : "Disabled"} · Customer access{" "}
                {item.customer_enabled ? "on" : "off"}
              </Copy>
              <Button
                title={`Configure ${model.labels[item.plugin_id] ?? item.plugin_id}`}
                onPress={() => router.push(`/plugins/${item.id}/edit`)}
              />
            </Panel>
          ))}
          {model.items.some((item) => item.enabled) && (
            <Button
              title="Credit customer"
              onPress={() => router.push("/plugins/credit")}
            />
          )}
          <Button
            title="Previous"
            disabled={model.page === 1}
            onPress={() => model.setPage(model.page - 1)}
          />
          <Copy>
            {model.page} / {model.last}
          </Copy>
          <Button
            title="Next"
            disabled={model.page >= model.last}
            onPress={() => model.setPage(model.page + 1)}
          />
        </>
      ) : (
        <Copy>Administrator access required.</Copy>
      )}
    </AdminPage>
  );
}
