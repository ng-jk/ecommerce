import { errorMessage } from "@portfolio/api-client";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
  usePlatformSession,
} from "../../platform_shell_screen";
import { useMembership } from "../logic/useMembership";

export function PlatformMembership() {
  const { id, memberId } = useLocalSearchParams<{
    id: string;
    memberId: string;
  }>();
  const { api, user } = usePlatformSession();
  const model = useMembership(id, memberId);
  const detail = model.result;
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const mutate = async (
    action: "revoke" | "accept",
    expectedVersion: number,
  ) => {
    setBusy(true);
    setActionError("");
    try {
      if (action === "revoke")
        await api.workspace.revoke(id, memberId, {
          expected_version: expectedVersion,
        });
      else
        await api.workspace.accept(id, memberId, {
          expected_version: expectedVersion,
        });
      model.retry();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const canAccept =
    detail?.membership.status === "invited" &&
    detail.membership.user?.kind === "platform" &&
    detail.membership.user.id === user?.id;
  return (
    <PlatformPage title="Member">
      <PlatformButton
        title="Members"
        secondary
        onPress={() =>
          router.replace(`/platform/organizations/${id}/memberships`)
        }
      />
      {!user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : detail ? (
        <>
          <PlatformText>
            {detail.membership.user?.name ?? "Unavailable user"} ·{" "}
            {detail.options.role[detail.membership.role] ?? "Unsupported role"}
          </PlatformText>
          <PlatformText>
            Status:{" "}
            {detail.options.status[detail.membership.status] ??
              "Unsupported status"}
          </PlatformText>
          {detail.can_manage && (
            <PlatformButton
              title="Edit role"
              onPress={() =>
                router.push(
                  `/platform/organizations/${id}/memberships/${memberId}/edit`,
                )
              }
            />
          )}
          {detail.can_manage && detail.membership.status !== "revoked" && (
            <PlatformButton
              title="Revoke"
              disabled={busy}
              secondary
              onPress={() => void mutate("revoke", detail.membership.version)}
            />
          )}
          {canAccept && (
            <PlatformButton
              title="Accept invitation"
              disabled={busy}
              onPress={() => void mutate("accept", detail.membership.version)}
            />
          )}
          {!!actionError && <PlatformText>{actionError}</PlatformText>}
        </>
      ) : model.error ? (
        <>
          <PlatformText>{model.error}</PlatformText>
          <PlatformButton title="Retry" onPress={model.retry} />
        </>
      ) : (
        <PlatformText>Loading member…</PlatformText>
      )}
    </PlatformPage>
  );
}
