import { router, useLocalSearchParams } from "expo-router";
import { Fragment } from "react";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import { usePlatformApplications } from "../logic/usePlatformApplications";

export function PlatformApplications() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const model = usePlatformApplications(id);
  const result = model.catalog.result;
  return (
    <PlatformPage title="Applications">
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
          <PlatformText>Application catalog</PlatformText>
          {result.data.length === 0 && (
            <PlatformText>No applications on this page.</PlatformText>
          )}
          {result.data.map((item) => (
            <Fragment key={item.application_key}>
              <PlatformText>
                {item.name} ·{" "}
                {item.state
                  ? (result.meta.options.state[item.state] ?? item.state)
                  : "Not installed"}{" "}
                · {item.entitled ? "Entitled" : "No entitlement"}
              </PlatformText>
              {result.meta.can_manage &&
                item.state === null &&
                item.available &&
                item.entitled && (
                  <PlatformButton
                    title={`Install ${item.name}`}
                    disabled={!!model.busyKey}
                    onPress={() =>
                      void model.change(
                        item.application_key,
                        null,
                        item.version,
                      )
                    }
                  />
                )}
              {result.meta.can_manage &&
                item.state === "installed" &&
                item.application_key !== "framework" && (
                  <PlatformButton
                    title={`Disable ${item.name}`}
                    disabled={!!model.busyKey}
                    onPress={() =>
                      void model.change(
                        item.application_key,
                        "installed",
                        item.version,
                      )
                    }
                  />
                )}
              {result.meta.can_manage &&
                item.state === "disabled" &&
                item.available &&
                item.entitled && (
                  <PlatformButton
                    title={`Re-enable ${item.name}`}
                    disabled={!!model.busyKey}
                    onPress={() =>
                      void model.change(
                        item.application_key,
                        "disabled",
                        item.version,
                      )
                    }
                  />
                )}
            </Fragment>
          ))}
          <PlatformText>
            Catalog page {model.catalogPage} of {result.meta.last_page}
          </PlatformText>
          <PlatformButton
            title="Previous catalog page"
            secondary
            disabled={model.catalogPage === 1}
            onPress={() => model.setCatalogPage(model.catalogPage - 1)}
          />
          <PlatformButton
            title="Next catalog page"
            secondary
            disabled={model.catalogPage >= result.meta.last_page}
            onPress={() => model.setCatalogPage(model.catalogPage + 1)}
          />
          {!!model.mutationError && (
            <PlatformText>{model.mutationError}</PlatformText>
          )}
        </>
      ) : model.catalog.error ? (
        <>
          <PlatformText>{model.catalog.error}</PlatformText>
          <PlatformButton title="Retry catalog" onPress={model.catalog.retry} />
        </>
      ) : (
        <PlatformText>Loading catalog…</PlatformText>
      )}
    </PlatformPage>
  );
}
