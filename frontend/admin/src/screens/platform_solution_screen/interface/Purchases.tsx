import { router, useLocalSearchParams } from "expo-router";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import { usePlatformSolutions } from "../logic/usePlatformSolutions";

export function PlatformSolutionPurchases() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const model = usePlatformSolutions(id);
  const result = model.purchases.result;
  return (
    <PlatformPage title="Solution purchases">
      <PlatformButton
        title="Organization"
        secondary
        onPress={() => router.replace(`/platform/organizations/${id}`)}
      />
      {!model.user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : result ? (
        <>
          {result.data.length === 0 && (
            <PlatformText>No solution purchases yet.</PlatformText>
          )}
          {result.data.map((item) => (
            <PlatformButton
              key={item.id}
              title={`Purchase ${item.id} · ${result.meta.options.status[item.status] ?? "Unsupported status"}`}
              onPress={() =>
                router.push(
                  `/platform/organizations/${id}/solutions/${item.id}`,
                )
              }
            />
          ))}
          <PlatformText>
            Page {model.page} of {result.meta.last_page}
          </PlatformText>
          <PlatformButton
            title="Previous page"
            secondary
            disabled={model.page === 1}
            onPress={() => model.setPage(model.page - 1)}
          />
          <PlatformButton
            title="Next page"
            secondary
            disabled={model.page >= result.meta.last_page}
            onPress={() => model.setPage(model.page + 1)}
          />
        </>
      ) : model.purchases.error ? (
        <>
          <PlatformText>{model.purchases.error}</PlatformText>
          <PlatformButton title="Retry list" onPress={model.purchases.retry} />
        </>
      ) : (
        <PlatformText>Loading purchases…</PlatformText>
      )}
    </PlatformPage>
  );
}
