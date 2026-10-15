import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
  usePlatformSession,
} from "../../platform_shell_screen";
import { usePlatformQuery } from "../../platform_workspace_screen";
import { helpdeskPath } from "../logic/model";
import { ErrorText } from "./Forms";

export function HelpdeskAgentAssign() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, user } = usePlatformSession();
  const [queuePage, setQueuePage] = useState(1);
  const [memberPage, setMemberPage] = useState(1);
  const [queueId, setQueueId] = useState<number | null>(null);
  const [memberId, setMemberId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<unknown>(null);
  const queues = usePlatformQuery(
    !!user,
    useCallback(
      () => api.helpdesk.queues(id, queuePage, "active"),
      [api, id, queuePage],
    ),
  );
  const memberships = usePlatformQuery(
    !!user,
    useCallback(
      () => api.workspace.memberships(id, memberPage, "active"),
      [api, id, memberPage],
    ),
  );
  const roster = usePlatformQuery(
    !!user && !!queueId,
    useCallback(
      () => api.helpdesk.agents(id, 1, String(queueId)),
      [api, id, queueId],
    ),
  );
  const save = async () => {
    setBusy(true);
    setReason(null);
    try {
      const existing = roster.result?.data.find(
        (agent) => agent.platform_user_id === memberId,
      );
      await api.helpdesk.assignAgent(id, {
        queue_id: queueId!,
        target_platform_user_id: memberId!,
        ...(existing?.status === "revoked"
          ? { expected_version: existing.version }
          : {}),
      });
      router.replace(helpdeskPath(id, "agents"));
    } catch (error) {
      setReason(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <PlatformPage title="Assign queue agent">
      {!user ? (
        <PlatformText>Sign in to manage agents.</PlatformText>
      ) : (
        <>
          <PlatformText>Choose an active queue.</PlatformText>
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
                disabled={queuePage === 1}
                onPress={() => setQueuePage(queuePage - 1)}
              />
              <PlatformButton
                title="Next queues"
                secondary
                disabled={queuePage >= queues.result!.meta.last_page}
                onPress={() => setQueuePage(queuePage + 1)}
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
          <PlatformText>
            Choose a current organization platform member.
          </PlatformText>
          {memberships.result ? (
            <>
              {memberships.result.data
                .filter(
                  (member) =>
                    member.status === "active" &&
                    member.user?.kind === "platform",
                )
                .map((member) => (
                  <PlatformButton
                    key={member.id}
                    secondary
                    title={`${memberId === member.user!.id ? "Selected: " : ""}${member.user!.name}`}
                    onPress={() => setMemberId(member.user!.id)}
                  />
                ))}
              <PlatformButton
                title="Previous members"
                secondary
                disabled={memberPage === 1}
                onPress={() => setMemberPage(memberPage - 1)}
              />
              <PlatformButton
                title="Next members"
                secondary
                disabled={memberPage >= memberships.result!.meta.last_page}
                onPress={() => setMemberPage(memberPage + 1)}
              />
            </>
          ) : memberships.error ? (
            <>
              <PlatformText>{memberships.error}</PlatformText>
              <PlatformButton
                title="Retry members"
                onPress={memberships.retry}
              />
            </>
          ) : (
            <PlatformText>Loading members…</PlatformText>
          )}
          <ErrorText reason={reason} />
          <PlatformButton
            title="Assign agent"
            disabled={busy || !queueId || !memberId}
            onPress={() => void save()}
          />
          <PlatformButton
            title="Cancel"
            secondary
            onPress={() => router.replace(helpdeskPath(id, "agents"))}
          />
        </>
      )}
    </PlatformPage>
  );
}

export function HelpdeskTicketAssign() {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const { api, user } = usePlatformSession();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<unknown>(null);
  const ticket = usePlatformQuery(
    !!user,
    useCallback(
      () => api.helpdesk.ownerTicket(id, recordId),
      [api, id, recordId],
    ),
  );
  const queueId = ticket.result?.ticket.queue_id;
  const agents = usePlatformQuery(
    !!user && !!queueId,
    useCallback(
      () => api.helpdesk.agents(id, page, String(queueId), "active"),
      [api, id, page, queueId],
    ),
  );
  const save = async () => {
    setBusy(true);
    setReason(null);
    try {
      await api.helpdesk.assignTicket(id, recordId, {
        assigned_platform_user_id: selected!,
        expected_version: ticket.result!.ticket.version,
      });
      router.replace(helpdeskPath(id, "owner/tickets", recordId));
    } catch (error) {
      setReason(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <PlatformPage title="Assign ticket">
      {!user ? (
        <PlatformText>Sign in to assign tickets.</PlatformText>
      ) : ticket.result ? (
        <>
          <PlatformText>{ticket.result.ticket.subject}</PlatformText>
          <PlatformText>
            Choose a current agent from this ticket’s queue. Membership is
            rechecked by the platform.
          </PlatformText>
          {agents.result ? (
            <>
              {agents.result.data.map((agent) => (
                <PlatformButton
                  key={agent.id}
                  secondary
                  title={`${selected === agent.platform_user_id ? "Selected: " : ""}Member ${agent.platform_user_id}`}
                  onPress={() => setSelected(agent.platform_user_id)}
                />
              ))}
              <PlatformButton
                title="Previous agents"
                secondary
                disabled={page === 1}
                onPress={() => setPage(page - 1)}
              />
              <PlatformButton
                title="Next agents"
                secondary
                disabled={page >= agents.result!.meta.last_page}
                onPress={() => setPage(page + 1)}
              />
            </>
          ) : agents.error ? (
            <>
              <PlatformText>{agents.error}</PlatformText>
              <PlatformButton title="Retry agents" onPress={agents.retry} />
            </>
          ) : (
            <PlatformText>Loading agents…</PlatformText>
          )}
          <ErrorText reason={reason} />
          <PlatformButton
            title="Assign ticket"
            disabled={busy || !selected}
            onPress={() => void save()}
          />
          <PlatformButton
            title="Cancel"
            secondary
            onPress={() =>
              router.replace(helpdeskPath(id, "owner/tickets", recordId))
            }
          />
        </>
      ) : ticket.error ? (
        <>
          <PlatformText>{ticket.error}</PlatformText>
          <PlatformButton title="Retry ticket" onPress={ticket.retry} />
        </>
      ) : (
        <PlatformText>Loading ticket…</PlatformText>
      )}
    </PlatformPage>
  );
}
