import { Button, Copy, Panel } from "@portfolio/storefront";
import { router } from "expo-router";
import { AdminPage } from "../../admin_shell_screen";
import { useOrganizationsList } from "../logic/useOrganizationsList";

export function OrganizationsList() {
  const model = useOrganizationsList();
  const result = model.result;
  return (
    <AdminPage title="Organizations">
      <Button title="Dashboard" onPress={() => router.replace("/")} />
      {!model.user ? <Copy>Sign in to view organizations.</Copy> : <>
        <Button title="Create organization" onPress={() => router.push("/organizations/create")} />
        {result ? <>
          <Button title={`Status: ${model.status ? result.meta.options.status[model.status] ?? "Unavailable" : "All"}`} onPress={model.cycleStatus} />
          {result.data.length === 0 && <Copy>No organizations on this page.</Copy>}
          {result.data.map((organization) => <Panel key={organization.id}>
            <Copy>{organization.name} · {organization.code} · {result.meta.options.status[organization.status] ?? "Unsupported status"}</Copy>
            <Button title={`View ${organization.name}`} onPress={() => router.push(`/organizations/${organization.id}`)} />
          </Panel>)}
          <Button title="Previous" disabled={model.page === 1} onPress={() => model.setPage(model.page - 1)} />
          <Copy>{model.page} / {result.meta.last_page}</Copy>
          <Button title="Next" disabled={model.page >= result.meta.last_page} onPress={() => model.setPage(model.page + 1)} />
        </> : model.failed ? <><Copy>Could not load organizations.</Copy><Button title="Retry" onPress={model.retry} /></> : <Copy>Loading organizations…</Copy>}
      </>}
    </AdminPage>
  );
}
