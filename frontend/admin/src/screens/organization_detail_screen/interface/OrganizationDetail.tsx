import { Button, Copy } from "@portfolio/storefront";
import { router, useLocalSearchParams } from "expo-router";
import { AdminPage } from "../../admin_shell_screen";
import { useOrganizationDetail } from "../logic/useOrganizationDetail";

export function OrganizationDetail() {
  const params = useLocalSearchParams<{ id: string }>();
  const { user, detail, failed, retry } = useOrganizationDetail(params.id);
  const organization = detail?.organization;
  return <AdminPage title="Organization">
    <Button title="Organizations" onPress={() => router.replace("/organizations")} />
    {!user ? <Copy>Sign in to view this organization.</Copy> : !organization ? failed ? <><Copy>Could not load organization.</Copy><Button title="Retry" onPress={retry} /></> : <Copy>Loading organization…</Copy> : <>
      <Copy>{organization.name} · {organization.code}</Copy>
      <Copy>Status: {detail.options.status[organization.status] ?? "Unsupported status"}</Copy>
      {detail.can_update && <Button title="Edit name" onPress={() => router.push(`/organizations/${organization.id}/edit`)} />}
      <Button title="Applications" onPress={() => router.push(`/organizations/${organization.id}/applications`)} />
    </>}
  </AdminPage>;
}
