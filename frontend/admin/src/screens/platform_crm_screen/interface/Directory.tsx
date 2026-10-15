import { router, useLocalSearchParams } from "expo-router";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import { useCrmDirectory } from "../logic/useCrmDirectory";
import { crmLabel, crmPath, crmSingular, type CrmKind } from "../logic/model";

export function CrmDirectory({ kind }: { kind: CrmKind }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const model = useCrmDirectory(id, kind);
  const result = model.result;
  return (
    <PlatformPage title={crmLabel[kind]}>
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
      ) : (
        <>
          <PlatformButton
            title={`Create ${crmSingular[kind].toLowerCase()}`}
            onPress={() => router.push(`${crmPath(id, kind)}/create`)}
          />
          {result ? (
            <>
              {kind === "leads" && (
                <PlatformButton
                  title={`Status: ${model.status ? (result.meta.options?.status[model.status] ?? "Unavailable") : "All"}`}
                  secondary
                  onPress={model.cycleStatus}
                />
              )}
              {result.data.length === 0 && (
                <PlatformText>No {kind} on this page.</PlatformText>
              )}
              {result.data.map((record) => (
                <PlatformButton
                  key={record.id}
                  title={`${record.name}${"code" in record ? ` · ${record.code}` : ` · ${record.email}`}`}
                  onPress={() => router.push(crmPath(id, kind, record.id))}
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
            <PlatformText>Loading {kind}…</PlatformText>
          )}
        </>
      )}
    </PlatformPage>
  );
}
