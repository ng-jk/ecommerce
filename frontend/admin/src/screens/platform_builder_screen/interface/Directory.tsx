import { router, useLocalSearchParams } from "expo-router";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import { builderPath } from "../logic/model";
import { useBuilderDirectory } from "../logic/useBuilderDirectory";

export function BuilderDirectory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const model = useBuilderDirectory(id);
  const result = model.result;
  return (
    <PlatformPage title="Builder pages">
      <PlatformButton
        title="Services"
        secondary
        onPress={() =>
          router.replace(`/platform/organizations/${id}/service-hub`)
        }
      />
      {!model.user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : (
        <>
          <PlatformButton
            title="Create page"
            onPress={() => router.push(`${builderPath(id)}/create`)}
          />
          {result ? (
            <>
              <PlatformButton
                title={`Status: ${model.status ? (result.meta.options.status[model.status] ?? "Unavailable") : "All"}`}
                secondary
                onPress={model.cycleStatus}
              />
              {result.data.length === 0 && (
                <PlatformText>No pages on this page.</PlatformText>
              )}
              {result.data.map((page) => (
                <PlatformButton
                  key={page.id}
                  title={`${page.title} · ${page.status}`}
                  onPress={() => router.push(builderPath(id, page.id))}
                />
              ))}
              <PlatformText>
                Page {model.page} of {result.meta.last_page}
              </PlatformText>
              <PlatformButton
                title="Previous"
                secondary
                disabled={model.page === 1}
                onPress={() => model.setPage(model.page - 1)}
              />
              <PlatformButton
                title="Next"
                secondary
                disabled={model.page >= result.meta.last_page}
                onPress={() => model.setPage(model.page + 1)}
              />
            </>
          ) : model.error ? (
            <>
              <PlatformText>{model.error}</PlatformText>
              <PlatformButton title="Retry" onPress={model.retry} />
            </>
          ) : (
            <PlatformText>Loading Builder pages…</PlatformText>
          )}
        </>
      )}
    </PlatformPage>
  );
}
