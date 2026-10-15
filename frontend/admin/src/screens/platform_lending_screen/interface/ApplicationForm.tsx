import type { LendingApplication } from "@portfolio/api-client";
import { router } from "expo-router";
import {
  PlatformButton,
  PlatformField,
  PlatformText,
} from "../../platform_shell_screen";
import { lendingPath } from "../logic/model";
import { useApplicationForm } from "../logic/forms";

export function ApplicationForm({
  organizationId,
  initial,
  selectedProductId,
}: {
  organizationId: string;
  initial?: LendingApplication;
  selectedProductId?: string;
}) {
  const model = useApplicationForm(organizationId, initial, selectedProductId);
  const errors = (key: string) =>
    model.fieldErrors[key]?.map((text, index) => (
      <PlatformText key={`${key}.${index}`}>{text}</PlatformText>
    ));
  return (
    <>
      {initial ? (
        <PlatformText>Product #{initial.product_id}</PlatformText>
      ) : (
        <>
          <PlatformField
            label="Active product ID"
            value={model.productId}
            onChangeText={model.setProductId}
            keyboardType="numeric"
          />
          {errors("product_id")}
        </>
      )}
      <PlatformField
        label="Principal, minor units"
        value={model.principal}
        onChangeText={model.setPrincipal}
        keyboardType="numeric"
      />
      {errors("principal_minor")}
      <PlatformField
        label="First due date (YYYY-MM-DD, UTC)"
        value={model.date}
        onChangeText={model.setDate}
      />
      {errors("first_due_date")}
      <PlatformField
        label="Purpose"
        value={model.purpose}
        onChangeText={model.setPurpose}
      />
      {errors("purpose")}
      {errors("expected_version")}
      {!!model.message && <PlatformText>{model.message}</PlatformText>}
      <PlatformButton
        title={initial ? "Save draft" : "Create draft"}
        disabled={model.busy}
        onPress={model.save}
      />
      <PlatformButton
        title="Cancel"
        secondary
        onPress={() =>
          router.replace(
            lendingPath(organizationId, "applications", initial?.id),
          )
        }
      />
    </>
  );
}
