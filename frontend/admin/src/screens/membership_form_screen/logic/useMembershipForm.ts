import { ApiError, type Membership } from "@portfolio/api-client";
import { useStore } from "@portfolio/storefront";
import { router } from "expo-router";
import { useState } from "react";

export function useMembershipForm(
  organizationId: string,
  roles: Record<string, string>,
  initial?: Membership,
) {
  const { api, run, busy } = useStore();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState(
    initial?.role ?? Object.keys(roles)[0] ?? "",
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const cycleRole = () => {
    const options = Object.keys(roles);
    setRole(options[(options.indexOf(role) + 1) % options.length] ?? "");
  };
  const save = () =>
    run(async () => {
      setFieldErrors({});
      if (
        !initial &&
        (!/^[1-9][0-9]*$/.test(userId) || !Number.isSafeInteger(Number(userId)))
      ) {
        setFieldErrors({ user_id: ["Enter a valid existing user ID."] });
        return;
      }
      try {
        if (initial) {
          await api.platformWorkspace.changeRole(organizationId, initial.id, {
            role,
            expected_version: initial.version,
          });
          router.replace(
            `/organizations/${organizationId}/memberships/${initial.id}`,
          );
        } else {
          const result = await api.platformWorkspace.invite(organizationId, {
            user_id: Number(userId),
            role,
          });
          router.replace(
            `/organizations/${organizationId}/memberships/${result.membership.id}`,
          );
        }
      } catch (error) {
        if (error instanceof ApiError) setFieldErrors(error.validation_error);
        throw error;
      }
    });
  return { userId, setUserId, role, cycleRole, fieldErrors, busy, save };
}
