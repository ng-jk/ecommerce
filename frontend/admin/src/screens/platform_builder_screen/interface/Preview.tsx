import { router, useLocalSearchParams } from "expo-router";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import { builderPath } from "../logic/model";
import { useBuilderPreview } from "../logic/useBuilderPreview";

export function BuilderPreview() {
  const { id, pageId } = useLocalSearchParams<{ id: string; pageId: string }>();
  const model = useBuilderPreview(id, pageId);
  return (
    <PlatformPage title="Published preview">
      <PlatformButton
        title="Page"
        secondary
        onPress={() => router.replace(builderPath(id, pageId))}
      />
      {!model.user ? (
        <PlatformText>Sign in to preview this page.</PlatformText>
      ) : model.result ? (
        <>
          <PlatformText>{model.result.render.title}</PlatformText>
          {model.result.render.blocks.map((block, index) => (
            <PlatformText key={index}>
              {block.type === "heading" || block.type === "paragraph"
                ? block.text
                : block.type === "image"
                  ? `Image: ${block.alt} (${block.src})`
                  : `${block.label}: ${block.url}`}
            </PlatformText>
          ))}
          <PlatformText>
            Published version {model.result.render.published_version}
          </PlatformText>
        </>
      ) : model.error ? (
        <>
          <PlatformText>{model.error}</PlatformText>
          <PlatformButton title="Retry" onPress={model.retry} />
        </>
      ) : (
        <PlatformText>Loading published page…</PlatformText>
      )}
    </PlatformPage>
  );
}
