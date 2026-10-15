import { router, useLocalSearchParams } from "expo-router";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import { lendingPath, statusLabel } from "../logic/model";
import { useLendingDirectory, type LendingKind } from "../logic/queries";

const titles: Record<LendingKind, string> = {
  products: "Lending products",
  applications: "My applications",
  reviews: "Application reviews",
};

function Directory({ kind }: { kind: LendingKind }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const model = useLendingDirectory(id, kind);
  const result = model.result;
  return (
    <PlatformPage title={titles[kind]}>
      <PlatformButton
        title="Lending"
        secondary
        onPress={() => router.replace(lendingPath(id))}
      />
      {!model.user ? (
        <PlatformText>Sign in to view lending records.</PlatformText>
      ) : (
        <>
          {kind !== "reviews" && (
            <PlatformButton
              title={
                kind === "products" ? "Create product" : "Start application"
              }
              onPress={() => router.push(`${lendingPath(id, kind)}/create`)}
            />
          )}
          {result ? (
            <>
              <PlatformButton
                title={`Status: ${model.status ? statusLabel(result.meta.options, model.status) : "All"}`}
                secondary
                onPress={model.cycleStatus}
              />
              {result.data.length === 0 && (
                <PlatformText>No records on this page.</PlatformText>
              )}
              {result.data.map((item) => (
                <PlatformButton
                  key={item.id}
                  title={
                    "code" in item
                      ? `${item.code} · ${item.name}`
                      : `#${item.id} · ${statusLabel(result.meta.options, item.status)}`
                  }
                  onPress={() => router.push(lendingPath(id, kind, item.id))}
                />
              ))}
              <PlatformText>
                Page {model.page} of {result.meta.last_page};{" "}
                {result.meta.total} total
              </PlatformText>
              <PlatformButton
                title="Previous"
                secondary
                disabled={model.page <= 1}
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
            <PlatformText>Loading records…</PlatformText>
          )}
        </>
      )}
    </PlatformPage>
  );
}

export const LendingProductsDirectory = () => <Directory kind="products" />;
export const LendingApplicationsDirectory = () => (
  <Directory kind="applications" />
);
export const LendingReviewsDirectory = () => <Directory kind="reviews" />;
