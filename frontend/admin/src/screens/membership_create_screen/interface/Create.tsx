import { Button, Copy } from "@portfolio/storefront";
import { useLocalSearchParams } from "expo-router";
import { AdminPage } from "../../admin_shell_screen";
import { Form } from "../../membership_form_screen";
import { useMembershipsList } from "../../memberships_list_screen";

export function Create() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const model = useMembershipsList(id);
  const result = model.result;
  return (
    <AdminPage title="Invite member">
      {!model.user ? (
        <Copy>Sign in to invite a member.</Copy>
      ) : !result ? (
        model.failed ? (
          <>
            <Copy>Could not load member options.</Copy>
            <Button title="Retry" onPress={model.retry} />
          </>
        ) : (
          <Copy>Loading member options…</Copy>
        )
      ) : result.meta.can_manage ? (
        <Form organizationId={id} roles={result.meta.options.role} />
      ) : (
        <Copy>Only an organization owner can invite members.</Copy>
      )}
    </AdminPage>
  );
}
