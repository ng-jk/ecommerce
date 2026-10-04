import type { PluginInstallation } from "@portfolio/merchant-plugins";
import { Button, Copy, Field } from "@portfolio/storefront";
import { router } from "expo-router";
import { usePluginForm } from "../logic/usePluginForm";

export function PluginForm({
  initial,
  label,
}: {
  initial?: PluginInstallation;
  label: string;
}) {
  const model = usePluginForm(initial);
  return (
    <>
      <Copy>Plugin: {label}</Copy>
      <Button
        title={`Merchant enabled: ${model.enabled ? "Yes" : "No"}`}
        onPress={() => model.setEnabled(!model.enabled)}
      />
      {model.fieldErrors.enabled?.map((message, index) => (
        <Copy key={`enabled.${index}`}>{message}</Copy>
      ))}
      <Button
        title={`Customer access: ${model.customerEnabled ? "Yes" : "No"}`}
        onPress={() => model.setCustomerEnabled(!model.customerEnabled)}
      />
      {model.fieldErrors.customer_enabled?.map((message, index) => (
        <Copy key={`customer_enabled.${index}`}>{message}</Copy>
      ))}
      <Field
        label="Maximum points per credit"
        value={model.maxCredit}
        onChangeText={model.setMaxCredit}
        keyboardType="numeric"
      />
      {model.fieldErrors.max_credit?.map((message, index) => (
        <Copy key={`max_credit.${index}`}>{message}</Copy>
      ))}
      {model.fieldErrors.plugin_id?.map((message, index) => (
        <Copy key={`plugin_id.${index}`}>{message}</Copy>
      ))}
      {model.fieldErrors.expected_version?.map((message, index) => (
        <Copy key={`expected_version.${index}`}>{message}</Copy>
      ))}
      <Button
        title={initial ? "Save changes" : "Install plugin"}
        disabled={model.busy}
        onPress={() => void model.save()}
      />
      <Button
        title="Cancel"
        secondary
        onPress={() => router.replace("/plugins")}
      />
    </>
  );
}
