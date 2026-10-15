import { Button, Copy } from "@portfolio/storefront";
import { useLocalSearchParams } from "expo-router";
import { AdminPage } from "../../admin_shell_screen";
import { useMembershipDetail } from "../../membership_detail_screen";
import { Form } from "../../membership_form_screen";

export function Edit() {
  const { id, memberId } = useLocalSearchParams<{
    id: string;
    memberId: string;
  }>();
  const model = useMembershipDetail(id, memberId);
  const detail = model.detail;
  return (
    <AdminPage title="Change member role">
      {!model.user ? (
        <Copy>Sign in to change a member role.</Copy>
      ) : !detail ? (
        model.failed ? (
          <>
            <Copy>Could not load member.</Copy>
            <Button title="Retry" onPress={model.retry} />
          </>
        ) : (
          <Copy>Loading member…</Copy>
        )
      ) : detail.can_manage && detail.membership.status !== "revoked" ? (
        <Form
          organizationId={id}
          initial={detail.membership}
          roles={detail.options.role}
        />
      ) : (
        <Copy>Only an organization owner can change this role.</Copy>
      )}
    </AdminPage>
  );
}
