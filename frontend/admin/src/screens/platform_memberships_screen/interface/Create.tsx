import { router, useLocalSearchParams } from "expo-router";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import { useMemberships } from "../logic/useMemberships";
import { PlatformMembershipForm } from "./MembershipForm";

export function PlatformMembershipCreate() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const model = useMemberships(id);
  return (
    <PlatformPage title="Invite member">
      {!model.user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : model.result ? (
        model.result.meta.can_manage ? (
          <PlatformMembershipForm
            organizationId={id}
            roles={model.result.meta.options.role}
          />
        ) : (
          <PlatformText>
            Organization owner or administrator access is required.
          </PlatformText>
        )
      ) : model.error ? (
        <>
          <PlatformText>{model.error}</PlatformText>
          <PlatformButton title="Retry" onPress={model.retry} />
        </>
      ) : (
        <PlatformText>Loading membership options…</PlatformText>
      )}
    </PlatformPage>
  );
}
