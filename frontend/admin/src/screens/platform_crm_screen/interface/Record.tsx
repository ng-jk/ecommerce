import { router, useLocalSearchParams } from "expo-router";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import { useCrmRecord } from "../logic/useCrmRecord";
import { crmPath, crmSingular, type CrmKind } from "../logic/model";

export function CrmRecordPage({ kind }: { kind: CrmKind }) {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const model = useCrmRecord(id, kind, recordId);
  const record = model.result?.record;
  return (
    <PlatformPage title={crmSingular[kind]}>
      <PlatformButton
        title={`All ${kind}`}
        secondary
        onPress={() => router.replace(crmPath(id, kind))}
      />
      {!model.user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : record ? (
        <>
          <PlatformText>{record.name}</PlatformText>
          {"code" in record && <PlatformText>Code: {record.code}</PlatformText>}
          {"email" in record && (
            <PlatformText>Email: {record.email}</PlatformText>
          )}
          {"company_id" in record && (
            <PlatformText>
              Company ID: {record.company_id ?? "None"}
            </PlatformText>
          )}
          {"status" in record && (
            <PlatformText>
              Status:{" "}
              {model.result?.options?.status[record.status] ?? "Unavailable"}
            </PlatformText>
          )}
          {"contact_id" in record && record.contact_id && (
            <PlatformButton
              title="Converted contact"
              secondary
              onPress={() =>
                router.push(crmPath(id, "contacts", record.contact_id!))
              }
            />
          )}
          <PlatformButton
            title="Edit"
            onPress={() => router.push(`${crmPath(id, kind, record.id)}/edit`)}
          />
          {kind === "leads" &&
            "status" in record &&
            record.status === "qualified" && (
              <PlatformButton
                title="Convert to contact"
                disabled={model.busy}
                onPress={() => void model.convert()}
              />
            )}
          {!!model.actionError && (
            <PlatformText>{model.actionError}</PlatformText>
          )}
        </>
      ) : model.error ? (
        <>
          <PlatformText>{model.error}</PlatformText>
          <PlatformButton title="Retry" onPress={model.retry} />
        </>
      ) : (
        <PlatformText>Loading {crmSingular[kind].toLowerCase()}…</PlatformText>
      )}
    </PlatformPage>
  );
}
