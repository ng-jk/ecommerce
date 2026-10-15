import { Button, Copy, Panel } from "@portfolio/storefront";
import { router, useLocalSearchParams } from "expo-router";
import { AdminPage } from "../../admin_shell_screen";
import { useMembershipsList } from "../logic/useMembershipsList";

export function MembershipsList() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const model = useMembershipsList(id);
  const result = model.result;
  return (
    <AdminPage title="Members">
      <Button
        title="Organization"
        onPress={() => router.replace(`/organizations/${id}`)}
      />
      {!model.user ? (
        <Copy>Sign in to view members.</Copy>
      ) : !result ? (
        model.failed ? (
          <>
            <Copy>Could not load members.</Copy>
            <Button title="Retry" onPress={model.retry} />
          </>
        ) : (
          <Copy>Loading members…</Copy>
        )
      ) : (
        <>
          {result.meta.can_manage && (
            <Button
              title="Invite member"
              onPress={() =>
                router.push(`/organizations/${id}/memberships/create`)
              }
            />
          )}
          <Button
            title={`Status: ${model.status ? (result.meta.options.status[model.status] ?? "Unavailable") : "All"}`}
            onPress={() => model.cycle("status")}
          />
          <Button
            title={`Role: ${model.role ? (result.meta.options.role[model.role] ?? "Unavailable") : "All"}`}
            onPress={() => model.cycle("role")}
          />
          {result.data.length === 0 && <Copy>No members on this page.</Copy>}
          {result.data.map((member) => (
            <Panel key={member.id}>
              <Copy>
                {member.user?.name ?? "Unavailable user"} ·{" "}
                {result.meta.options.role[member.role] ?? "Unsupported role"} ·{" "}
                {result.meta.options.status[member.status] ??
                  "Unsupported status"}
              </Copy>
              <Button
                title={`View ${member.user?.name ?? "member"}`}
                onPress={() =>
                  router.push(`/organizations/${id}/memberships/${member.id}`)
                }
              />
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
