import { router, useLocalSearchParams } from "expo-router";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import { erpPath } from "../logic/model";
import { useErpAccounts, useErpJournals } from "../logic/useErpDirectory";

export function ErpAccountsDirectory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const model = useErpAccounts(id);
  const result = model.result;
  return (
    <PlatformPage title="Chart of accounts">
      <PlatformButton
        title="General ledger"
        secondary
        onPress={() => router.replace(erpPath(id))}
      />
      {!model.user ? (
        <PlatformText>Sign in to view accounts.</PlatformText>
      ) : (
        <>
          <PlatformButton
            title="Create account"
            onPress={() => router.push(`${erpPath(id, "accounts")}/create`)}
          />
          {result ? (
            <>
              <PlatformButton
                title={`Type: ${model.type ? (result.meta.options.type[model.type] ?? "Unavailable") : "All"}`}
                secondary
                onPress={model.cycleType}
              />
              {result.data.length === 0 && (
                <PlatformText>No accounts on this page.</PlatformText>
              )}
              {result.data.map((account) => (
                <PlatformButton
                  key={account.id}
                  title={`${account.code} · ${account.name}`}
                  onPress={() =>
                    router.push(erpPath(id, "accounts", account.id))
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
            <PlatformText>Loading accounts…</PlatformText>
          )}
        </>
      )}
    </PlatformPage>
  );
}

export function ErpJournalsDirectory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const model = useErpJournals(id);
  const result = model.result;
  return (
    <PlatformPage title="Journals">
      <PlatformButton
        title="General ledger"
        secondary
        onPress={() => router.replace(erpPath(id))}
      />
      {!model.user ? (
        <PlatformText>Sign in to view journals.</PlatformText>
      ) : (
        <>
          <PlatformButton
            title="Create draft"
            onPress={() => router.push(`${erpPath(id, "journals")}/create`)}
          />
          {result ? (
            <>
              <PlatformButton
                title={`Status: ${model.status ? (result.meta.options.status[model.status] ?? "Unavailable") : "All"}`}
                secondary
                onPress={model.cycleStatus}
              />
              {result.data.length === 0 && (
                <PlatformText>No journals on this page.</PlatformText>
              )}
              {result.data.map((journal) => (
                <PlatformButton
                  key={journal.id}
                  title={`${journal.effective_date} · ${journal.description}`}
                  onPress={() =>
                    router.push(erpPath(id, "journals", journal.id))
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
            <PlatformText>Loading journals…</PlatformText>
          )}
        </>
      )}
    </PlatformPage>
  );
}
