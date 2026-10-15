import { router, useLocalSearchParams } from "expo-router";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import { useMembership } from "../logic/useMembership";
import { PlatformMembershipForm } from "./MembershipForm";

export function PlatformMembershipEdit() {
  const { id, memberId } = useLocalSearchParams<{
    id: string;
    memberId: string;
  }>();
  const model = useMembership(id, memberId);
  return (
    <PlatformPage title="Edit member role">
      {!model.user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : model.result ? (
        model.result.can_manage ? (
          <PlatformMembershipForm
            organizationId={id}
            roles={model.result.options.role}
            initial={model.result.membership}
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
        <PlatformText>Loading member…</PlatformText>
      )}
    </PlatformPage>
  );
}
