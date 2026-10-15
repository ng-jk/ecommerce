import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import { erpPath } from "../logic/model";
import { useErpLedger } from "../logic/useErpRecord";

export function ErpLedger() {
  const { id, accountId = "" } = useLocalSearchParams<{
    id: string;
    accountId?: string;
  }>();
  const [page, setPage] = useState(1);
  const model = useErpLedger(id, accountId, page);
  const result = model.result;
  return (
    <PlatformPage title="Posted ledger">
      <PlatformButton
        title="Account"
        secondary
        onPress={() => router.replace(erpPath(id, "accounts", accountId))}
      />
      {!model.user ? (
        <PlatformText>Sign in to view the ledger.</PlatformText>
      ) : !accountId ? (
        <PlatformText>Choose an account from the chart first.</PlatformText>
      ) : result ? (
        <>
          {result.data.length === 0 && (
            <PlatformText>No posted lines on this page.</PlatformText>
          )}
          {result.data.map((line) => (
            <PlatformText key={line.id}>
              Journal {line.journal_id}: debit {line.debit_minor}, credit{" "}
              {line.credit_minor}
            </PlatformText>
          ))}
          <PlatformText>
            Page {page} of {result.meta.last_page}
          </PlatformText>
          <PlatformButton
            title="Previous"
            secondary
            disabled={page === 1}
            onPress={() => setPage(page - 1)}
          />
          <PlatformButton
            title="Next"
            secondary
            disabled={page >= result.meta.last_page}
            onPress={() => setPage(page + 1)}
          />
        </>
      ) : model.error ? (
        <>
          <PlatformText>{model.error}</PlatformText>
          <PlatformButton title="Retry" onPress={model.retry} />
        </>
      ) : (
        <PlatformText>Loading posted ledger…</PlatformText>
      )}
    </PlatformPage>
  );
}
