import { Button, Copy } from "@portfolio/storefront";
import { useLocalSearchParams } from "expo-router";
import { AdminPage } from "../../admin_shell_screen";
import { Form } from "../../organization_form_screen";
import { useOrganizationEdit } from "../logic/useOrganizationEdit";

export function Edit() {
  const params = useLocalSearchParams<{ id: string }>();
  const { user, detail, failed, retry } = useOrganizationEdit(params.id);
  return (
    <AdminPage title="Edit organization">
      {!user ? <Copy>Sign in to edit this organization.</Copy> : !detail ? failed ? <><Copy>Could not load organization.</Copy><Button title="Retry" onPress={retry} /></> : <Copy>Loading organization…</Copy> : detail.can_update ? <Form initial={detail.organization} /> : <Copy>Only the organization owner can rename it.</Copy>}
    </AdminPage>
  );
}
