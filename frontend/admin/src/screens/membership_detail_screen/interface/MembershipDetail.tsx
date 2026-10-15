import { Button, Copy } from "@portfolio/storefront";
import { router, useLocalSearchParams } from "expo-router";
import { AdminPage } from "../../admin_shell_screen";
import { useMembershipDetail } from "../logic/useMembershipDetail";

export function MembershipDetail() {
  const { id, memberId } = useLocalSearchParams<{
    id: string;
    memberId: string;
  }>();
  const model = useMembershipDetail(id, memberId);
  const detail = model.detail;
  const member = detail?.membership;
  return (
    <AdminPage title="Member">
      <Button
        title="Members"
        onPress={() => router.replace(`/organizations/${id}/memberships`)}
      />
      {!model.user ? (
        <Copy>Sign in to view this member.</Copy>
      ) : !member ? (
        model.failed ? (
          <>
            <Copy>Could not load member.</Copy>
            <Button title="Retry" onPress={model.retry} />
          </>
        ) : (
          <Copy>Loading member…</Copy>
        )
      ) : (
        <>
          <Copy>
            {member.user?.name ?? "Unavailable user"} ·{" "}
            {member.user?.kind === "platform"
              ? "Platform account"
              : "Shop account"}
          </Copy>
          <Copy>
            Role: {detail.options.role[member.role] ?? "Unsupported role"}
          </Copy>
          <Copy>
            Status:{" "}
            {detail.options.status[member.status] ?? "Unsupported status"}
          </Copy>
          {detail.can_manage && member.status !== "revoked" && (
            <Button
              title="Change role"
              onPress={() =>
                router.push(`/organizations/${id}/memberships/${memberId}/edit`)
              }
            />
          )}
          {detail.can_manage && member.status !== "revoked" && (
            <Button
              title="Revoke access"
              disabled={model.busy}
              onPress={() => void model.revoke()}
            />
          )}
          {model.canAccept && (
            <Button
              title="Accept invitation"
              disabled={model.busy}
              onPress={() => void model.accept()}
            />
          )}
        </>
      )}
    </AdminPage>
  );
}
