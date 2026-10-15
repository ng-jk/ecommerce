import { Button, Copy, Panel } from "@portfolio/storefront";
import { router, useLocalSearchParams } from "expo-router";
import { AdminPage } from "../../admin_shell_screen";
import { useOrganizationApplications } from "../logic/useOrganizationApplications";

export function Applications() {
  const params = useLocalSearchParams<{ id: string }>();
  const model = useOrganizationApplications(params.id);
  const result = model.result;
  return (
    <AdminPage title="Applications">
      <Button
        title="Organization"
        onPress={() => router.replace(`/organizations/${params.id}`)}
      />
      {!model.user ? (
        <Copy>Sign in to view applications.</Copy>
      ) : !result ? (
        model.failed ? (
          <>
            <Copy>Could not load applications.</Copy>
            <Button title="Retry" onPress={model.retry} />
          </>
        ) : (
          <Copy>Loading applications…</Copy>
        )
      ) : (
        <>
          {result.data.length === 0 && (
            <Copy>No applications on this page.</Copy>
          )}
          {result.data.map((application) => (
            <Panel key={application.id}>
              <Copy>
                {application.name} · {application.application_key}
              </Copy>
              <Copy>
                {result.meta.options.state[application.state] ??
                  "Unsupported state"}{" "}
                · Contract v{application.contract_version}
              </Copy>
            </Panel>
          ))}
          <Button
            title="Previous"
            disabled={model.page === 1}
            onPress={() => model.setPage(model.page - 1)}
          />
          <Copy>
            {model.page} / {result.meta.last_page}
          </Copy>
          <Button
            title="Next"
            disabled={model.page >= result.meta.last_page}
            onPress={() => model.setPage(model.page + 1)}
          />
        </>
      )}
    </AdminPage>
  );
}
