import { ApiError, errorMessage } from "@portfolio/api-client";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  PlatformButton,
  PlatformField,
  PlatformPage,
  PlatformText,
  usePlatformSession,
} from "../../platform_shell_screen";
import { usePlatformQuery } from "../../platform_workspace_screen";
import { helpdeskPath } from "../logic/model";

export function ErrorText({ reason }: { reason: unknown }) {
  if (!reason) return null;
  return (
    <>
      <PlatformText>{errorMessage(reason)}</PlatformText>
      {reason instanceof ApiError &&
        Object.entries(reason.validation_error).map(([field, messages]) =>
          messages.map((message, index) => (
            <PlatformText key={`${field}.${index}`}>
              {field}: {message}
            </PlatformText>
          )),
        )}
    </>
  );
}

export function HelpdeskQueueForm({ edit = false }: { edit?: boolean }) {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId?: string;
  }>();
  const { api, user } = usePlatformSession();
  const detail = usePlatformQuery(
    !!user && edit && !!recordId,
    useCallback(() => api.helpdesk.queue(id, recordId!), [api, id, recordId]),
  );
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<unknown>(null);
  const record = detail.result?.queue;
  const chosenName = name || record?.name || "";
  const chosenStatus = status || record?.status || "";
  const options = detail.result?.options.status ?? {};
  const keys = Object.keys(options);
  const save = async () => {
    setBusy(true);
    setReason(null);
    try {
      const result =
        edit && record
          ? await api.helpdesk.updateQueue(id, record.id, {
              name: chosenName,
              status: chosenStatus,
              expected_version: record.version,
            })
          : await api.helpdesk.createQueue(id, {
              code: code.trim().toLowerCase(),
              name: chosenName,
            });
      router.replace(helpdeskPath(id, "queues", result.queue.id));
    } catch (error) {
      setReason(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <PlatformPage title={edit ? "Edit queue" : "Create queue"}>
      {!user ? (
        <PlatformText>Sign in to manage queues.</PlatformText>
      ) : edit && !record ? (
        detail.error ? (
          <>
            <PlatformText>{detail.error}</PlatformText>
            <PlatformButton title="Retry" onPress={detail.retry} />
          </>
        ) : (
          <PlatformText>Loading queue…</PlatformText>
        )
      ) : (
        <>
          {edit ? (
            <PlatformText>Code: {record?.code}</PlatformText>
          ) : (
            <PlatformField
              label="Code"
              value={code}
              onChangeText={setCode}
              autoCapitalize="none"
            />
          )}
          <PlatformField
            label="Name"
            value={chosenName}
            onChangeText={setName}
          />
          {edit && (
            <PlatformButton
              title={`Status: ${options[chosenStatus] ?? "Unavailable"}`}
              secondary
              onPress={() =>
                setStatus(
                  keys[(keys.indexOf(chosenStatus) + 1) % keys.length] ??
                    chosenStatus,
                )
              }
            />
          )}
          <ErrorText reason={reason} />
          <PlatformButton
            title={edit ? "Save queue" : "Create queue"}
            disabled={busy}
            onPress={() => void save()}
          />
          <PlatformButton
            title="Cancel"
            secondary
            onPress={() =>
              router.replace(helpdeskPath(id, "queues", record?.id))
            }
          />
        </>
      )}
    </PlatformPage>
  );
}

export function HelpdeskTicketForm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, user } = usePlatformSession();
  const [page, setPage] = useState(1);
  const queues = usePlatformQuery(
    !!user,
    useCallback(() => api.helpdesk.queues(id, page, "active"), [api, id, page]),
  );
  const [queueId, setQueueId] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<unknown>(null);
  const save = async () => {
    setBusy(true);
    setReason(null);
    try {
      const result = await api.helpdesk.createTicket(id, {
        queue_id: queueId!,
        subject,
        description,
      });
      router.replace(helpdeskPath(id, "tickets", result.ticket.id));
    } catch (error) {
      setReason(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <PlatformPage title="Create ticket">
      {!user ? (
        <PlatformText>Sign in to create a ticket.</PlatformText>
      ) : (
        <>
          <PlatformText>Choose a current active queue.</PlatformText>
          {queues.result ? (
            <>
              {queues.result.data.map((queue) => (
                <PlatformButton
                  key={queue.id}
                  secondary
                  title={`${queueId === queue.id ? "Selected: " : ""}${queue.name}`}
                  onPress={() => setQueueId(queue.id)}
                />
              ))}
              <PlatformButton
                title="Previous queues"
                secondary
                disabled={page === 1}
                onPress={() => setPage(page - 1)}
              />
              <PlatformButton
                title="Next queues"
                secondary
                disabled={page >= queues.result!.meta.last_page}
                onPress={() => setPage(page + 1)}
              />
            </>
          ) : queues.error ? (
            <>
              <PlatformText>{queues.error}</PlatformText>
              <PlatformButton title="Retry queues" onPress={queues.retry} />
            </>
          ) : (
            <PlatformText>Loading queues…</PlatformText>
          )}
          <PlatformField
            label="Subject"
            value={subject}
            onChangeText={setSubject}
          />
          <PlatformField
            label="Description"
            value={description}
            onChangeText={setDescription}
            multiline
          />
          <ErrorText reason={reason} />
          <PlatformButton
            title="Create ticket"
            disabled={busy || !queueId}
            onPress={() => void save()}
          />
          <PlatformButton
            title="Cancel"
            secondary
            onPress={() => router.replace(helpdeskPath(id, "tickets"))}
          />
        </>
      )}
    </PlatformPage>
  );
}
