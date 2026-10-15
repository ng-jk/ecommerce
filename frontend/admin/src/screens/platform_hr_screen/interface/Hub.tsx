import { router, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
  usePlatformSession,
} from "../../platform_shell_screen";
import { usePlatformQuery } from "../../platform_workspace_screen";
import { hrPath } from "../logic/model";

export function HrHub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, user } = usePlatformSession();
  const org = usePlatformQuery(
    !!user,
    useCallback(() => api.workspace.organization(id), [api, id]),
  );
  return (
    <PlatformPage title="HR">
      <PlatformButton
        title="Services"
        secondary
        onPress={() =>
          router.replace(`/platform/organizations/${id}/service-hub`)
        }
      />
      {!user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : org.result ? (
        <>
          <PlatformButton
            title="My profile"
            onPress={() => router.push(hrPath(id, "me"))}
          />
          <PlatformButton
            title="My attendance"
            onPress={() => router.push(hrPath(id, "attendance"))}
          />
          <PlatformButton
            title="My leave"
            onPress={() => router.push(hrPath(id, "leave"))}
          />
          <PlatformButton
            title="Leave types"
            onPress={() => router.push(hrPath(id, "leave-types"))}
          />
          {org.result.can_update && (
            <PlatformButton
              title="Employees"
              onPress={() => router.push(hrPath(id, "employees"))}
            />
          )}
          {org.result.can_update && (
            <PlatformButton
              title="Approve leave"
              onPress={() => router.push(hrPath(id, "owner/leave"))}
            />
          )}
        </>
      ) : org.error ? (
        <>
          <PlatformText>{org.error}</PlatformText>
          <PlatformButton title="Retry" onPress={org.retry} />
        </>
      ) : (
        <PlatformText>Loading HR…</PlatformText>
      )}
    </PlatformPage>
  );
}
