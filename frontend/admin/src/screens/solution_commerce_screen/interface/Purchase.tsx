import { Button, Copy } from "@portfolio/storefront";
import { router, useLocalSearchParams } from "expo-router";
import { AdminPage } from "../../admin_shell_screen";
import { useSolutionPurchase } from "../logic/useShopSolutions";

export function SolutionPurchase() {
  const { id, purchaseId } = useLocalSearchParams<{
    id: string;
    purchaseId: string;
  }>();
  const model = useSolutionPurchase(id, purchaseId);
  const result = model.query.result;
  return (
    <AdminPage title="Solution purchase">
      <Button
        title="Purchases"
        secondary
        onPress={() =>
          router.replace(`/organizations/${id}/solution-purchases`)
        }
      />
      {!model.user ? (
        <Copy>Sign in to view this purchase.</Copy>
      ) : result ? (
        <>
          <Copy>
            Purchase {result.purchase_id} ·{" "}
            {result.options.status[result.status] ?? "Unsupported status"}
          </Copy>
          <Copy>Provisioning attempts: {result.attempts}</Copy>
          {result.status === "failed" && (
            <Button
              title="Retry provisioning"
              disabled={model.busy}
              onPress={() => void model.retry()}
            />
          )}
          {!!model.error && <Copy>{model.error}</Copy>}
          <Button
            title="Refresh status"
            secondary
            onPress={model.query.retry}
          />
        </>
      ) : model.query.error ? (
        <>
          <Copy>{model.query.error}</Copy>
          <Button title="Retry status" onPress={model.query.retry} />
        </>
      ) : (
        <Copy>Loading status…</Copy>
      )}
    </AdminPage>
  );
}
