import { Button, Copy, Field } from "@portfolio/storefront";
import { router, useLocalSearchParams } from "expo-router";
import { AdminPage } from "../../admin_shell_screen";
import { useBindSolution } from "../logic/useShopSolutions";

export function BindSolutionPurchase() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const model = useBindSolution(id);
  return (
    <AdminPage title="Bind solution order">
      <Copy>
        Enter the offering used at checkout and your order from this shop. The
        offering version is fixed on that order. You must own this organization.
      </Copy>
      <Field
        label="Offering ID"
        keyboardType="number-pad"
        value={model.offeringId}
        onChangeText={model.setOfferingId}
      />
      <Field
        label="Order ID"
        keyboardType="number-pad"
        value={model.orderId}
        onChangeText={model.setOrderId}
      />
      {!!model.error && <Copy>{model.error}</Copy>}
      <Button
        title="Bind order"
        disabled={model.busy}
        onPress={() => void model.save()}
      />
      <Button
        title="Cancel"
        secondary
        onPress={() =>
          router.replace(`/organizations/${id}/solution-purchases`)
        }
      />
    </AdminPage>
  );
}
