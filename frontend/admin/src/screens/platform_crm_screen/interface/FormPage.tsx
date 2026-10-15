import { useLocalSearchParams } from "expo-router";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
  usePlatformSession,
} from "../../platform_shell_screen";
import { useCrmRecord } from "../logic/useCrmRecord";
import { crmSingular, type CrmKind } from "../logic/model";
import { CrmForm } from "./Form";

export function CrmCreatePage({ kind }: { kind: CrmKind }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = usePlatformSession();
  return (
    <PlatformPage title={`Create ${crmSingular[kind].toLowerCase()}`}>
      {user ? (
        <CrmForm organizationId={id} kind={kind} />
      ) : (
        <PlatformText>Sign in to create a CRM record.</PlatformText>
      )}
    </PlatformPage>
  );
}

export function CrmEditPage({ kind }: { kind: CrmKind }) {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const model = useCrmRecord(id, kind, recordId);
  return (
    <PlatformPage title={`Edit ${crmSingular[kind].toLowerCase()}`}>
      {!model.user ? (
        <PlatformText>Sign in to edit a CRM record.</PlatformText>
      ) : model.result ? (
        <CrmForm
          organizationId={id}
          kind={kind}
          initial={model.result.record}
          statusOptions={model.result.options?.status ?? {}}
        />
      ) : model.error ? (
        <>
          <PlatformText>{model.error}</PlatformText>
          <PlatformButton title="Retry" onPress={model.retry} />
        </>
      ) : (
        <PlatformText>Loading CRM record…</PlatformText>
      )}
    </PlatformPage>
  );
}
