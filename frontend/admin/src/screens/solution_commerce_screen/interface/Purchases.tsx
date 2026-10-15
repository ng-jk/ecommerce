import { Button, Copy, Panel } from "@portfolio/storefront";
import { router, useLocalSearchParams } from "expo-router";
import { AdminPage } from "../../admin_shell_screen";
import { useSolutionPurchases } from "../logic/useShopSolutions";

export function SolutionPurchases() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const model = useSolutionPurchases(id);
  const result = model.query.result;
  return (
    <AdminPage title="Solution purchases">
      <Button
        title="Organization"
        secondary
        onPress={() => router.replace(`/organizations/${id}`)}
      />
      {!model.user ? (
        <Copy>Sign in to view purchases.</Copy>
      ) : (
        <>
          <Button
            title="Bind an order"
            onPress={() =>
              router.push(`/organizations/${id}/solution-purchases/create`)
            }
          />
          {result ? (
            <>
              {result.data.length === 0 && (
                <Copy>No solution purchases yet.</Copy>
              )}
              {result.data.map((item) => (
                <Panel key={item.id}>
                  <Copy>
                    Order {item.order_id} · MYR{" "}
                    {(item.quoted_total / 100).toFixed(2)} ·{" "}
                    {result.meta.options.status[item.status] ??
                      "Unsupported status"}
                  </Copy>
                  <Button
                    title={`View purchase ${item.id}`}
                    onPress={() =>
                      router.push(
                        `/organizations/${id}/solution-purchases/${item.id}`,
                      )
                    }
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
            <Copy>Loading purchases…</Copy>
          )}
        </>
      )}
    </AdminPage>
  );
}
