import type { BuilderPage } from "@portfolio/api-client";
import { router } from "expo-router";
import {
  PlatformButton,
  PlatformField,
  PlatformText,
} from "../../platform_shell_screen";
import { builderPath } from "../logic/model";
import { useBuilderForm } from "../logic/useBuilderForm";

export function BuilderForm({
  organizationId,
  initial,
}: {
  organizationId: string;
  initial?: BuilderPage;
}) {
  const model = useBuilderForm(organizationId, initial);
  const errors = (field: string) =>
    model.fieldErrors[field]?.map((message, index) => (
      <PlatformText key={`${field}.${index}`}>{message}</PlatformText>
    ));
  return (
    <>
      {initial ? (
        <PlatformText>Slug: {initial.slug}</PlatformText>
      ) : (
        <>
          <PlatformField
            label="Slug"
            value={model.slug}
            onChangeText={model.setSlug}
            autoCapitalize="none"
          />
          {errors("slug")}
        </>
      )}
      <PlatformField
        label="Title"
        value={model.title}
        onChangeText={model.setTitle}
      />
      {errors("title")}
      <PlatformField
        label="Heading"
        value={model.headingText}
        onChangeText={model.setHeadingText}
      />
      {errors("blocks.0.text")}
      <PlatformField
        label="Body paragraph"
        value={model.bodyText}
        onChangeText={model.setBodyText}
      />
      {errors("blocks.1.text")}
      {errors("blocks")}
      {errors("expected_version")}
      {!!model.message && <PlatformText>{model.message}</PlatformText>}
      <PlatformButton
        title={initial ? "Save draft" : "Create draft"}
        disabled={model.busy}
        onPress={() => void model.save()}
      />
      <PlatformButton
        title="Cancel"
        secondary
        onPress={() => router.replace(builderPath(organizationId, initial?.id))}
      />
    </>
  );
}
