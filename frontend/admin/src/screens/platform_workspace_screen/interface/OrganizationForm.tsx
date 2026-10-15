import type { Organization } from "@portfolio/api-client";
import { router } from "expo-router";
import {
  PlatformButton,
  PlatformField,
  PlatformText,
} from "../../platform_shell_screen";
import { usePlatformOrganizationForm } from "../logic/usePlatformOrganizationForm";

export function PlatformOrganizationForm({
  initial,
}: {
  initial?: Organization;
}) {
  const model = usePlatformOrganizationForm(initial);
  return (
    <>
      {initial ? (
        <PlatformText>Code: {initial.code}</PlatformText>
      ) : (
        <PlatformField
          label="Code"
          value={model.code}
          onChangeText={model.setCode}
          autoCapitalize="none"
        />
      )}
      {model.fieldErrors.code?.map((message, index) => (
        <PlatformText key={`code.${index}`}>{message}</PlatformText>
      ))}
      <PlatformField
        label="Name"
        value={model.name}
        onChangeText={model.setName}
      />
      {model.fieldErrors.name?.map((message, index) => (
        <PlatformText key={`name.${index}`}>{message}</PlatformText>
      ))}
      {model.fieldErrors.expected_version?.map((message, index) => (
        <PlatformText key={`version.${index}`}>{message}</PlatformText>
      ))}
      {!!model.message && <PlatformText>{model.message}</PlatformText>}
      <PlatformButton
        title={initial ? "Save changes" : "Create organization"}
        disabled={model.busy}
        onPress={() => void model.save()}
      />
      <PlatformButton
        title="Cancel"
        secondary
        onPress={() =>
          router.replace(
            initial
              ? `/platform/organizations/${initial.id}`
              : "/platform/organizations",
          )
        }
      />
    </>
  );
}
