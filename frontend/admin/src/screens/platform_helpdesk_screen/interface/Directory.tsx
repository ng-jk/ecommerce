import { errorMessage } from "@portfolio/api-client";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
  usePlatformSession,
} from "../../platform_shell_screen";
import { useHelpdeskDirectory } from "../logic/useHelpdeskDirectory";
import {
  helpdeskBase,
  helpdeskPath,
  helpdeskTitle,
  type HelpdeskDirectoryKind,
} from "../logic/model";

export function HelpdeskDirectory({ kind }: { kind: HelpdeskDirectoryKind }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = usePlatformSession();
  const model = useHelpdeskDirectory(id, kind);
  const result = model.result;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const revoke = async (recordId: number, version: number) => {
    setBusy(true);
    setMessage("");
    try {
      await api.helpdesk.revokeAgent(id, recordId, {
        expected_version: version,
      });
      model.retry();
    } catch (reason) {
      setMessage(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <PlatformPage title={helpdeskTitle[kind]}>
      <PlatformButton
        title="Helpdesk"
        secondary
        onPress={() => router.replace(helpdeskBase(id))}
      />
      {!model.user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : result ? (
        <>
          {kind === "queues" && (
            <PlatformButton
              title="Create queue"
              onPress={() => router.push(`${helpdeskPath(id, kind)}/create`)}
            />
          )}
          {kind === "agents" && (
            <PlatformButton
              title="Assign agent"
              onPress={() => router.push(`${helpdeskPath(id, kind)}/assign`)}
            />
          )}
          {kind === "tickets" && (
            <PlatformButton
              title="Create ticket"
              onPress={() => router.push(`${helpdeskPath(id, kind)}/create`)}
            />
          )}
          <PlatformButton
            title={`Status: ${model.status ? (result.meta.options.status[model.status] ?? "Unavailable") : "All"}`}
            secondary
            onPress={model.cycleStatus}
          />
          {result.data.length === 0 && (
            <PlatformText>No records on this page.</PlatformText>
          )}
          {result.data.map((record) =>
            "platform_user_id" in record ? (
              <PlatformButton
                key={record.id}
                secondary
                disabled={busy || record.status !== "active"}
                title={`Revoke member ${record.platform_user_id} · ${result.meta.options.status[record.status] ?? "Unavailable"}`}
                onPress={() => void revoke(record.id, record.version)}
              />
            ) : (
              <PlatformButton
                key={record.id}
                title={
                  "subject" in record
                    ? `${record.subject} · ${result.meta.options.status[record.status] ?? "Unavailable"}`
                    : `${record.name} · ${result.meta.options.status[record.status] ?? "Unavailable"}`
                }
                onPress={() => router.push(helpdeskPath(id, kind, record.id))}
              />
            ),
          )}
          {!!message && <PlatformText>{message}</PlatformText>}
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
        <PlatformText>Loading {helpdeskTitle[kind]}…</PlatformText>
      )}
    </PlatformPage>
  );
}
