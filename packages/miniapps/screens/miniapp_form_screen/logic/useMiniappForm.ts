import { useState } from "react";
import type { Capability, MiniappClient } from "../../../services/miniapps";
export type MiniappFormValues = {
  packageId: number;
  version: string;
  enabled: boolean;
  grants: Capability[];
} & (
  { id: number; configVersion: number } | { id?: never; configVersion?: never }
);
export function useMiniappForm(
  client: MiniappClient,
  values: MiniappFormValues,
  onSaved: () => void,
) {
  const [enabled, setEnabled] = useState(values.enabled);
  const [grants, setGrants] = useState<Capability[]>(values.grants);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toggle = (capability: Capability) =>
    setGrants((current) =>
      current.includes(capability)
        ? current.filter((item) => item !== capability)
        : [...current, capability],
    );
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      if (values.id === undefined)
        await client.install(
          String(values.packageId),
          values.version,
          enabled,
          grants,
        );
      else
        await client.update(
          String(values.id),
          values.configVersion,
          enabled,
          grants,
        );
      onSaved();
    } catch {
      setError("Could not save this MiniApp. Refresh and try again.");
    } finally {
      setBusy(false);
    }
  };
  return { enabled, setEnabled, grants, toggle, busy, error, submit };
}
