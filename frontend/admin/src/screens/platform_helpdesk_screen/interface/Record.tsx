import { errorMessage } from "@portfolio/api-client";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
  usePlatformSession,
} from "../../platform_shell_screen";
import { usePlatformQuery } from "../../platform_workspace_screen";
import { helpdeskPath, nextTicketStatuses } from "../logic/model";

export function HelpdeskQueueRecord() {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const { api, user } = usePlatformSession();
  const model = usePlatformQuery(
    !!user,
    useCallback(() => api.helpdesk.queue(id, recordId), [api, id, recordId]),
  );
  const record = model.result?.queue;
  const options = model.result?.options.status ?? {};
  return (
    <PlatformPage title="Helpdesk queue">
      <PlatformButton
        title="Queues"
        secondary
        onPress={() => router.replace(helpdeskPath(id, "queues"))}
      />
      {!user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : record ? (
        <>
          <PlatformText>
            {record.name} · {record.code}
          </PlatformText>
          <PlatformText>
            Status: {options[record.status] ?? "Unavailable"}
          </PlatformText>
          <PlatformButton
            title="Edit queue"
            onPress={() =>
              router.push(`${helpdeskPath(id, "queues", record.id)}/edit`)
            }
          />
        </>
      ) : model.error ? (
        <>
          <PlatformText>{model.error}</PlatformText>
          <PlatformButton title="Retry" onPress={model.retry} />
        </>
      ) : (
        <PlatformText>Loading queue…</PlatformText>
      )}
    </PlatformPage>
  );
}

export type TicketMode = "tickets" | "agent/tickets" | "owner/tickets";

export function HelpdeskTicketRecord({ mode }: { mode: TicketMode }) {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const { api, user } = usePlatformSession();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(() => {
    switch (mode) {
      case "tickets":
        return api.helpdesk.requesterTicket(id, recordId);
      case "agent/tickets":
        return api.helpdesk.agentTicket(id, recordId);
      case "owner/tickets":
        return api.helpdesk.ownerTicket(id, recordId);
    }
  }, [api, id, recordId, mode]);
  const model = usePlatformQuery(!!user, load);
  const record = model.result?.ticket;
  const options = model.result?.options.status ?? {};
  const transitions = record ? nextTicketStatuses(record.status, options) : [];
  const changeStatus = async (status: string) => {
    setBusy(true);
    setMessage("");
    try {
      const input = { status, expected_version: record!.version };
      if (mode === "agent/tickets")
        await api.helpdesk.changeAgentTicketStatus(id, record!.id, input);
      else await api.helpdesk.changeOwnerTicketStatus(id, record!.id, input);
      model.retry();
    } catch (reason) {
      setMessage(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <PlatformPage
      title={
        mode === "tickets"
          ? "My ticket"
          : mode === "agent/tickets"
            ? "Agent ticket"
            : "Owner ticket"
      }
    >
      <PlatformButton
        title="Tickets"
        secondary
        onPress={() => router.replace(helpdeskPath(id, mode))}
      />
      {!user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : record ? (
        <>
          <PlatformText>{record.subject}</PlatformText>
          <PlatformText>{record.description}</PlatformText>
          <PlatformText>
            Status: {options[record.status] ?? "Unavailable"}
          </PlatformText>
          {"requester_platform_user_id" in record && (
            <PlatformText>
              Requester: {String(record.requester_platform_user_id)}
            </PlatformText>
          )}
          {"assigned_platform_user_id" in record && (
            <PlatformText>
              Assigned agent:{" "}
              {record.assigned_platform_user_id == null
                ? "Unassigned"
                : String(record.assigned_platform_user_id)}
            </PlatformText>
          )}
          {mode === "owner/tickets" && (
            <PlatformButton
              title="Assign agent"
              onPress={() =>
                router.push(`${helpdeskPath(id, mode, record.id)}/assign`)
              }
            />
          )}
          {mode !== "tickets" &&
            transitions.map((status) => (
              <PlatformButton
                key={status}
                title={`Set ${options[status]}`}
                disabled={busy}
                onPress={() => void changeStatus(status)}
              />
            ))}
          {!!message && <PlatformText>{message}</PlatformText>}
        </>
      ) : model.error ? (
        <>
          <PlatformText>{model.error}</PlatformText>
          <PlatformButton title="Retry" onPress={model.retry} />
        </>
      ) : (
        <PlatformText>Loading ticket…</PlatformText>
      )}
    </PlatformPage>
  );
}
