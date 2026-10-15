import { useLocalSearchParams } from "expo-router";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
  usePlatformSession,
} from "../../platform_shell_screen";
import { useErpAccounts } from "../logic/useErpDirectory";
import { useErpAccount, useErpJournal } from "../logic/useErpRecord";
import { ErpAccountForm } from "./AccountForm";
import { ErpJournalForm } from "./JournalForm";

export function ErpAccountCreatePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const model = useErpAccounts(id);
  return (
    <PlatformPage title="Create account">
      {!model.user ? (
        <PlatformText>Sign in to create an account.</PlatformText>
      ) : model.result ? (
        <ErpAccountForm
          organizationId={id}
          options={model.result.meta.options.type}
        />
      ) : model.error ? (
        <>
          <PlatformText>{model.error}</PlatformText>
          <PlatformButton title="Retry" onPress={model.retry} />
        </>
      ) : (
        <PlatformText>Loading account options…</PlatformText>
      )}
    </PlatformPage>
  );
}

export function ErpAccountEditPage() {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const model = useErpAccount(id, recordId);
  return (
    <PlatformPage title="Edit account">
      {!model.user ? (
        <PlatformText>Sign in to edit an account.</PlatformText>
      ) : model.result ? (
        <ErpAccountForm
          organizationId={id}
          initial={model.result.account}
          options={model.result.options.type}
        />
      ) : model.error ? (
        <>
          <PlatformText>{model.error}</PlatformText>
          <PlatformButton title="Retry" onPress={model.retry} />
        </>
      ) : (
        <PlatformText>Loading account…</PlatformText>
      )}
    </PlatformPage>
  );
}

export function ErpJournalCreatePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = usePlatformSession();
  return (
    <PlatformPage title="Create journal draft">
      {user ? (
        <ErpJournalForm organizationId={id} />
      ) : (
        <PlatformText>Sign in to create a journal.</PlatformText>
      )}
    </PlatformPage>
  );
}

export function ErpJournalEditPage() {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const model = useErpJournal(id, recordId);
  return (
    <PlatformPage title="Edit journal draft">
      {!model.user ? (
        <PlatformText>Sign in to edit a journal.</PlatformText>
      ) : model.result && model.result.journal.status !== "draft" ? (
        <PlatformText>Posted journals are immutable.</PlatformText>
      ) : model.result && model.result.journal.lines.length !== 2 ? (
        <PlatformText>
          This journal has multiple lines and cannot be edited in this view.
        </PlatformText>
      ) : model.result ? (
        <ErpJournalForm organizationId={id} initial={model.result.journal} />
      ) : model.error ? (
        <>
          <PlatformText>{model.error}</PlatformText>
          <PlatformButton title="Retry" onPress={model.retry} />
        </>
      ) : (
        <PlatformText>Loading journal…</PlatformText>
      )}
    </PlatformPage>
  );
}
