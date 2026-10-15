import type { ErpJournal } from "@portfolio/api-client";
import { router, useLocalSearchParams } from "expo-router";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import { erpPath } from "../logic/model";
import { useErpAccount, useErpJournal } from "../logic/useErpRecord";
import { useErpTransition } from "../logic/useErpTransition";

export function ErpAccountDetail() {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const model = useErpAccount(id, recordId);
  return (
    <PlatformPage title="Chart account">
      <PlatformButton
        title="Accounts"
        secondary
        onPress={() => router.replace(erpPath(id, "accounts"))}
      />
      {!model.user ? (
        <PlatformText>Sign in to view an account.</PlatformText>
      ) : model.result ? (
        <>
          <PlatformText>
            {model.result.account.code} · {model.result.account.name}
          </PlatformText>
          <PlatformText>
            Type:{" "}
            {model.result.options.type[model.result.account.type] ??
              "Unavailable"}
          </PlatformText>
          <PlatformButton
            title="Edit account"
            onPress={() =>
              router.push(`${erpPath(id, "accounts", recordId)}/edit`)
            }
          />
          <PlatformButton
            title="Posted ledger"
            onPress={() =>
              router.push(`${erpPath(id, "ledger")}?accountId=${recordId}`)
            }
          />
        </>
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

function JournalContent({
  organizationId,
  journal,
  reload,
}: {
  organizationId: string;
  journal: ErpJournal;
  reload: () => void;
}) {
  const transition = useErpTransition(organizationId, journal, reload);
  return (
    <>
      <PlatformText>
        {journal.description} · {journal.effective_date} · {journal.status}
      </PlatformText>
      <PlatformText>
        {journal.total_minor} {journal.currency} minor units per side
      </PlatformText>
      {journal.lines.map((line) => (
        <PlatformText key={line.id}>
          Account {line.account_id}: debit {line.debit_minor}, credit{" "}
          {line.credit_minor}
        </PlatformText>
      ))}
      {journal.status === "draft" ? (
        <>
          {journal.lines.length === 2 && (
            <PlatformButton
              title="Edit draft"
              onPress={() =>
                router.push(
                  `${erpPath(organizationId, "journals", journal.id)}/edit`,
                )
              }
            />
          )}
          <PlatformButton
            title="Post journal"
            disabled={transition.busy}
            onPress={() => void transition.run("post")}
          />
        </>
      ) : journal.reverses_journal_id === null ? (
        <PlatformButton
          title="Reverse journal"
          disabled={transition.busy}
          onPress={() => void transition.run("reverse")}
        />
      ) : (
        <PlatformText>
          Reversal of journal {journal.reverses_journal_id}
        </PlatformText>
      )}
      {!!transition.message && (
        <PlatformText>{transition.message}</PlatformText>
      )}
    </>
  );
}

export function ErpJournalDetail() {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const model = useErpJournal(id, recordId);
  return (
    <PlatformPage title="Journal">
      <PlatformButton
        title="Journals"
        secondary
        onPress={() => router.replace(erpPath(id, "journals"))}
      />
      {!model.user ? (
        <PlatformText>Sign in to view a journal.</PlatformText>
      ) : model.result ? (
        <JournalContent
          organizationId={id}
          journal={model.result.journal}
          reload={model.retry}
        />
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
