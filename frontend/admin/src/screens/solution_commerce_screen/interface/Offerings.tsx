import { Button, Copy, Panel } from "@portfolio/storefront";
import { router } from "expo-router";
import { AdminPage } from "../../admin_shell_screen";
import { useOfferings } from "../logic/useShopSolutions";

export function SolutionOfferings() {
  const model = useOfferings();
  const result = model.query.result;
  return (
    <AdminPage title="Solutions">
      <Button title="Dashboard" secondary onPress={() => router.replace("/")} />
      {model.user?.role === "admin" && (
        <Button
          title="Publish offering"
          onPress={() => router.push("/solutions/offerings/create")}
        />
      )}
      {result ? (
        <>
          {result.data.length === 0 && (
            <Copy>No published solutions on this page.</Copy>
          )}
          {result.data.map((item) => (
            <Panel key={item.id}>
              <Copy>
                {item.application_key} · version {item.version} · MYR{" "}
                {(item.unit_amount / 100).toFixed(2)}
              </Copy>
              <Button
                title={`View offering ${item.id}`}
                onPress={() => router.push(`/solutions/offerings/${item.id}`)}
              />
            </Panel>
          ))}
          <Copy>
            Page {model.page} of {result.meta.last_page}
          </Copy>
          <Button
            title="Previous page"
            secondary
            disabled={model.page === 1}
            onPress={() => model.setPage(model.page - 1)}
          />
          <Button
            title="Next page"
            secondary
            disabled={model.page >= result.meta.last_page}
            onPress={() => model.setPage(model.page + 1)}
          />
        </>
      ) : model.query.error ? (
        <>
          <Copy>{model.query.error}</Copy>
          <Button title="Retry" onPress={model.query.retry} />
        </>
      ) : (
        <Copy>Loading solutions…</Copy>
      )}
    </AdminPage>
  );
}
