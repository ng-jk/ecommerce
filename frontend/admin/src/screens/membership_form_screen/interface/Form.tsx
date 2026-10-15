import type { Membership } from "@portfolio/api-client";
import { Button, Copy, Field } from "@portfolio/storefront";
import { router } from "expo-router";
import { useMembershipForm } from "../logic/useMembershipForm";

export function Form({
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
        <Copy>Account: {initial.user?.name ?? "Unavailable user"}</Copy>
      ) : (
        <Field
          label="Existing shop user ID"
          value={model.userId}
          onChangeText={model.setUserId}
        />
      )}
      {model.fieldErrors.user_id?.map((message, index) => (
        <Copy key={`user-id.${index}`}>{message}</Copy>
      ))}
      <Button
        title={`Role: ${roles[model.role] ?? "Unavailable"}`}
        onPress={model.cycleRole}
      />
      {model.fieldErrors.role?.map((message, index) => (
        <Copy key={`role.${index}`}>{message}</Copy>
      ))}
      {model.fieldErrors.expected_version?.map((message, index) => (
        <Copy key={`version.${index}`}>{message}</Copy>
      ))}
      <Button
        title={initial ? "Save role" : "Send invitation"}
        disabled={model.busy || !model.role}
        onPress={() => void model.save()}
      />
      <Button
        title="Cancel"
        secondary
        onPress={() =>
          router.replace(
            initial
              ? `/organizations/${organizationId}/memberships/${initial.id}`
              : `/organizations/${organizationId}/memberships`,
          )
        }
      />
    </>
  );
}
