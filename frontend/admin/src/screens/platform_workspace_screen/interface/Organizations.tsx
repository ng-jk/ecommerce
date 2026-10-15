import { router } from "expo-router";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import { usePlatformOrganizations } from "../logic/usePlatformOrganizations";

export function PlatformOrganizations() {
  const model = usePlatformOrganizations();
  const result = model.result;
  return (
    <PlatformPage title="Organizations">
      <PlatformButton
        title="Account"
        secondary
        onPress={() => router.replace("/platform/profile")}
      />
      {!model.user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : (
        <>
          <PlatformButton
            title="Create organization"
            onPress={() => router.push("/platform/organizations/create")}
          />
          {result ? (
            <>
              <PlatformButton
                title={`Status: ${model.status ? (result.meta.options.status[model.status] ?? "Unavailable") : "All"}`}
                secondary
                onPress={model.cycleStatus}
              />
              {result.data.length === 0 && (
                <PlatformText>No organizations on this page.</PlatformText>
              )}
              {result.data.map((organization) => (
                <PlatformButton
                  key={organization.id}
                  title={`${organization.name} · ${organization.code}`}
                  onPress={() =>
                    router.push(`/platform/organizations/${organization.id}`)
                  }
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
            <PlatformText>Loading organizations…</PlatformText>
          )}
        </>
      )}
    </PlatformPage>
  );
}
