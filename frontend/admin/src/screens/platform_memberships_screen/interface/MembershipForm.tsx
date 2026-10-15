import type { Membership } from "@portfolio/api-client";
import { router } from "expo-router";
import {
  PlatformButton,
  PlatformField,
  PlatformText,
} from "../../platform_shell_screen";
import { useMembershipForm } from "../logic/useMembershipForm";

export function PlatformMembershipForm({
  organizationId,
  roles,
  initial,
}: {
  organizationId: string;
  roles: Record<string, string>;
  initial?: Membership;
}) {
  const model = useMembershipForm(organizationId, roles, initial);
  return (
    <>
      {initial ? (
        <PlatformText>{initial.user?.name ?? "Unavailable user"}</PlatformText>
      ) : (
        <PlatformField
          label="Platform user ID"
          value={model.platformUserId}
          onChangeText={model.setPlatformUserId}
          keyboardType="number-pad"
        />
      )}
      {model.fieldErrors.platform_user_id?.map((message, index) => (
        <PlatformText key={`user.${index}`}>{message}</PlatformText>
      ))}
      <PlatformButton
        title={`Role: ${roles[model.role] ?? "Unavailable"}`}
        secondary
        onPress={model.cycleRole}
      />
      {model.fieldErrors.role?.map((message, index) => (
        <PlatformText key={`role.${index}`}>{message}</PlatformText>
      ))}
      {model.fieldErrors.expected_version?.map((message, index) => (
        <PlatformText key={`version.${index}`}>{message}</PlatformText>
      ))}
      {!!model.message && <PlatformText>{model.message}</PlatformText>}
      <PlatformButton
        title={initial ? "Save role" : "Invite member"}
        disabled={model.busy}
        onPress={() => void model.save()}
      />
      <PlatformButton
        title="Cancel"
        secondary
        onPress={() =>
          router.replace(
            initial
              ? `/platform/organizations/${organizationId}/memberships/${initial.id}`
              : `/platform/organizations/${organizationId}/memberships`,
          )
        }
      />
    </>
  );
}
