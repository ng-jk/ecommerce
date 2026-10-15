import { ApiError, errorMessage, type Membership } from "@portfolio/api-client";
import { router } from "expo-router";
import { useState } from "react";
import { usePlatformSession } from "../../platform_shell_screen";

export function useMembershipForm(
  organizationId: string,
  roles: Record<string, string>,
  initial?: Membership,
) {
  const { api } = usePlatformSession();
  const [platformUserId, setPlatformUserId] = useState("");
  const [role, setRole] = useState(
    initial?.role ?? Object.keys(roles)[0] ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const cycleRole = () => {
    const values = Object.keys(roles);
    setRole(values[(values.indexOf(role) + 1) % values.length] ?? "");
  };
  const save = async () => {
    setBusy(true);
    setMessage("");
    setFieldErrors({});
    try {
      if (initial) {
        await api.workspace.changeRole(organizationId, initial.id, {
          role,
          expected_version: initial.version,
        });
        router.replace(
          `/platform/organizations/${organizationId}/memberships/${initial.id}`,
        );
      } else {
        const id = Number(platformUserId);
        if (!Number.isSafeInteger(id) || id <= 0) {
          setFieldErrors({
            platform_user_id: ["Enter a valid platform user ID."],
          });
          return;
        }
        const result = await api.workspace.invite(organizationId, {
          platform_user_id: id,
          role,
        });
        router.replace(
          `/platform/organizations/${organizationId}/memberships/${result.membership.id}`,
        );
      }
    } catch (error) {
      if (error instanceof ApiError) setFieldErrors(error.validation_error);
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return {
    platformUserId,
    setPlatformUserId,
    role,
    cycleRole,
    busy,
    message,
    fieldErrors,
    save,
  };
}
