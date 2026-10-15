import type { ErpAccount } from "@portfolio/api-client";
import { router } from "expo-router";
import {
  PlatformButton,
  PlatformField,
  PlatformText,
} from "../../platform_shell_screen";
import { erpPath } from "../logic/model";
import { useErpAccountForm } from "../logic/useErpAccountForm";

export function ErpAccountForm({
  organizationId,
  options,
  initial,
}: {
  organizationId: string;
  options: Record<string, string>;
  initial?: ErpAccount;
}) {
  const model = useErpAccountForm(organizationId, initial);
  const errors = (field: string) =>
    model.fieldErrors[field]?.map((message, index) => (
      <PlatformText key={`${field}.${index}`}>{message}</PlatformText>
    ));
  return (
    <>
      {initial ? (
        <PlatformText>Code: {initial.code}</PlatformText>
      ) : (
        <>
          <PlatformField
            label="Code"
            value={model.code}
            onChangeText={model.setCode}
            autoCapitalize="none"
          />
          {errors("code")}
        </>
      )}
      <PlatformField
        label="Name"
        value={model.name}
        onChangeText={model.setName}
      />
      {errors("name")}
      {initial ? (
        <PlatformText>
          Type: {options[initial.type] ?? "Unavailable"}
        </PlatformText>
      ) : (
        <>
          <PlatformButton
            title={`Type: ${options[model.type] ?? "Choose"}`}
            secondary
            onPress={() => model.cycleType(options)}
          />
          {errors("type")}
        </>
      )}
      {errors("expected_version")}
      {!!model.message && <PlatformText>{model.message}</PlatformText>}
      <PlatformButton
        title={initial ? "Save account" : "Create account"}
        disabled={model.busy}
        onPress={() => void model.save()}
      />
      <PlatformButton
        title="Cancel"
        secondary
        onPress={() =>
          router.replace(erpPath(organizationId, "accounts", initial?.id))
        }
      />
    </>
  );
}
