import { ApiError, type Organization } from "@portfolio/api-client";
import { useStore } from "@portfolio/storefront";
import { router } from "expo-router";
import { useState } from "react";

export function useOrganizationForm(initial?: Organization) {
  const { api, run, busy } = useStore();
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const save = () =>
    run(async () => {
      setFieldErrors({});
      try {
        if (initial) {
          await api.platformWorkspace.updateOrganization(initial.id, {
            name,
            expected_version: initial.version,
          });
          router.replace(`/organizations/${initial.id}`);
        } else {
          const result = await api.platformWorkspace.createOrganization({ code, name });
          router.replace(`/organizations/${result.organization.id}`);
        }
      } catch (error) {
        if (error instanceof ApiError) setFieldErrors(error.validation_error);
        throw error;
      }
    });
  return { code, setCode, name, setName, fieldErrors, busy, save };
}
