import type { Organization } from "@portfolio/api-client";
import { Button, Copy, Field } from "@portfolio/storefront";
import { router } from "expo-router";
import { useOrganizationForm } from "../logic/useOrganizationForm";

export function Form({ initial }: { initial?: Organization }) {
  const model = useOrganizationForm(initial);
  return (
    <>
      {initial ? (
        <Copy>Code: {initial.code}</Copy>
      ) : (
        <Field label="Code" value={model.code} onChangeText={model.setCode} />
      )}
      {model.fieldErrors.code?.map((message, index) => (
        <Copy key={`code.${index}`}>{message}</Copy>
      ))}
      <Field label="Name" value={model.name} onChangeText={model.setName} />
      {model.fieldErrors.name?.map((message, index) => (
        <Copy key={`name.${index}`}>{message}</Copy>
      ))}
      {model.fieldErrors.expected_version?.map((message, index) => (
        <Copy key={`version.${index}`}>{message}</Copy>
      ))}
      <Button
        title={initial ? "Save changes" : "Create organization"}
        disabled={model.busy}
        onPress={() => void model.save()}
      />
      <Button
        title="Cancel"
        secondary
        onPress={() =>
          router.replace(
            initial ? `/organizations/${initial.id}` : "/organizations",
          )
        }
      />
    </>
  );
}
