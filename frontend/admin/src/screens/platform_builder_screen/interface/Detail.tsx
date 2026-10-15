import type { BuilderPage } from "@portfolio/api-client";
import { router, useLocalSearchParams } from "expo-router";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import { builderPath } from "../logic/model";
import { useBuilderPublish } from "../logic/useBuilderPublish";
import { useBuilderRecord } from "../logic/useBuilderRecord";

function DetailContent({
  organizationId,
  page,
  retry,
}: {
  organizationId: string;
  page: BuilderPage;
  retry: () => void;
}) {
  const publish = useBuilderPublish(organizationId, page, retry);
  return (
    <>
      <PlatformText>
        /{page.slug} · {page.status} · version {page.version}
      </PlatformText>
      <PlatformText>{page.title}</PlatformText>
      <PlatformText>{page.blocks.length} draft blocks</PlatformText>
      <PlatformButton
        title="Edit draft"
        onPress={() =>
          router.push(`${builderPath(organizationId, page.id)}/edit`)
        }
      />
      <PlatformButton
        title="Publish"
        disabled={publish.busy || page.status === "published"}
        onPress={() => void publish.publish()}
      />
      {page.published_version !== null && (
        <PlatformButton
          title="Published preview"
          secondary
          onPress={() =>
            router.push(`${builderPath(organizationId, page.id)}/render`)
          }
        />
      )}
      {!!publish.message && <PlatformText>{publish.message}</PlatformText>}
    </>
  );
}

export function BuilderDetail() {
  const { id, pageId } = useLocalSearchParams<{ id: string; pageId: string }>();
  const model = useBuilderRecord(id, pageId);
  return (
    <PlatformPage title="Builder page">
      <PlatformButton
        title="Pages"
        secondary
        onPress={() => router.replace(builderPath(id))}
      />
      {!model.user ? (
        <PlatformText>Sign in to view this page.</PlatformText>
      ) : model.result ? (
        <DetailContent
          organizationId={id}
          page={model.result.page}
          retry={model.retry}
        />
      ) : model.error ? (
        <>
          <PlatformText>{model.error}</PlatformText>
          <PlatformButton title="Retry" onPress={model.retry} />
        </>
      ) : (
        <PlatformText>Loading page…</PlatformText>
      )}
    </PlatformPage>
  );
}
