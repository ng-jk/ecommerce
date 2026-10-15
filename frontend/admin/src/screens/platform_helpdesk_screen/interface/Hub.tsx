import { router, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
  usePlatformSession,
} from "../../platform_shell_screen";
import { usePlatformQuery } from "../../platform_workspace_screen";
import { helpdeskPath } from "../logic/model";

export function HelpdeskHub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, user } = usePlatformSession();
  const model = usePlatformQuery(
    !!user,
    useCallback(() => api.workspace.organization(id), [api, id]),
  );
  return (
    <PlatformPage title="Helpdesk">
      <PlatformButton
        title="Organization"
        secondary
        onPress={() => router.replace(`/platform/organizations/${id}`)}
      />
      {!user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : model.result ? (
        <>
          <PlatformButton
            title="My tickets"
            onPress={() => router.push(helpdeskPath(id, "tickets"))}
          />
          <PlatformButton
            title="Agent desk"
            onPress={() => router.push(helpdeskPath(id, "agent/tickets"))}
          />
          {model.result.can_update && (
            <>
              <PlatformButton
                title="Owner desk"
                onPress={() => router.push(helpdeskPath(id, "owner/tickets"))}
              />
              <PlatformButton
                title="Queues"
                onPress={() => router.push(helpdeskPath(id, "queues"))}
              />
              <PlatformButton
                title="Queue agents"
                onPress={() => router.push(helpdeskPath(id, "agents"))}
              />
            </>
          )}
        </>
      ) : model.error ? (
        <>
          <PlatformText>{model.error}</PlatformText>
          <PlatformButton title="Retry" onPress={model.retry} />
        </>
      ) : (
        <PlatformText>Loading Helpdesk…</PlatformText>
      )}
    </PlatformPage>
  );
}
