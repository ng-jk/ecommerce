import { router, useLocalSearchParams } from "expo-router";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import { useMemberships } from "../logic/useMemberships";

export function PlatformMemberships() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const model = useMemberships(id);
  const result = model.result;
  return (
    <PlatformPage title="Organization members">
      <PlatformButton
        title="Organization"
        secondary
        onPress={() => router.replace(`/platform/organizations/${id}`)}
      />
      {!model.user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : result ? (
        <>
          {result.meta.can_manage && (
            <PlatformButton
              title="Invite member"
              onPress={() =>
                router.push(`/platform/organizations/${id}/memberships/create`)
              }
            />
          )}
          <PlatformButton
            title={`Status: ${model.status ? (result.meta.options.status[model.status] ?? "Unavailable") : "All"}`}
            secondary
            onPress={model.cycleStatus}
          />
          {result.data.length === 0 && (
            <PlatformText>No members on this page.</PlatformText>
          )}
          {result.data.map((membership) => (
            <PlatformButton
              key={membership.id}
              title={`${membership.user?.name ?? "Unavailable user"} · ${result.meta.options.role[membership.role] ?? "Unsupported role"}`}
              onPress={() =>
                router.push(
                  `/platform/organizations/${id}/memberships/${membership.id}`,
                )
              }
            />
          ))}
          <PlatformText>
            Page {model.page} of {result.meta.last_page}
          </PlatformText>
          <PlatformButton
            title="Previous"
            secondary
            disabled={model.page === 1}
            onPress={() => model.setPage(model.page - 1)}
          />
          <PlatformButton
            title="Next"
            secondary
            disabled={model.page >= result.meta.last_page}
            onPress={() => model.setPage(model.page + 1)}
          />
        </>
      ) : model.error ? (
        <>
          <PlatformText>{model.error}</PlatformText>
          <PlatformButton title="Retry" onPress={model.retry} />
        </>
      ) : (
        <PlatformText>Loading members…</PlatformText>
      )}
    </PlatformPage>
  );
}
