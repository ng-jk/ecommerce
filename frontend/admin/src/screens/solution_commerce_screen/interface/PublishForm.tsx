import { Button, Copy, Field } from "@portfolio/storefront";
import { router } from "expo-router";
import { AdminPage } from "../../admin_shell_screen";
import { usePublishOffering } from "../logic/useShopSolutions";

export function PublishSolutionOffering() {
  const model = usePublishOffering();
  return (
    <AdminPage title="Publish solution offering">
      <Copy>
        Each publication fixes the current product price and deliverables as a
        new version.
      </Copy>
      <Field
        label="Product ID"
        keyboardType="number-pad"
        value={model.productId}
        onChangeText={model.setProductId}
      />
      <Field
        label="Application key"
        value={model.applicationKey}
        onChangeText={model.setApplicationKey}
      />
      <Field
        label="Deliverables, one per line"
        multiline
        value={model.deliverables}
        onChangeText={model.setDeliverables}
      />
      {!!model.error && <Copy>{model.error}</Copy>}
      <Button
        title="Publish"
        disabled={model.busy}
        onPress={() => void model.save()}
      />
      <Button
        title="Cancel"
        secondary
        onPress={() => router.replace("/solutions/offerings")}
      />
    </AdminPage>
  );
}
