import { useStore } from "@portfolio/storefront";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

export function useMembershipsList(organizationId: string) {
  const { api, run, user, shop } = useStore();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("");
  const [attempt, setAttempt] = useState(0);
  const scope = `${shop}.${user?.id ?? "guest"}.${organizationId}.${page}.${status}.${role}.${attempt}`;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState<{
    scope: string;
    result: Awaited<ReturnType<typeof api.platformWorkspace.memberships>>;
  } | null>(null);
  useFocusEffect(
    useCallback(() => {
      setLoaded(null);
      setFailed(false);
      if (!user) return;
      let active = true;
      void run(async () => {
        const result = await api.platformWorkspace.memberships(
          organizationId,
          page,
          status,
          role,
        );
        if (active) setLoaded({ scope, result });
      }).then((ok) => {
        if (active && !ok) setFailed(true);
      });
      return () => {
        active = false;
      };
    }, [api, run, user, organizationId, page, status, role, scope]),
  );
  const result = loaded?.scope === scope ? loaded.result : null;
  const cycle = (field: "status" | "role") => {
    const options = result?.meta.options[field] ?? {};
    const current = field === "status" ? status : role;
    const keys =
      field === "status" && !result?.meta.can_manage
        ? ["active"]
        : Object.keys(options);
    const next = keys[keys.indexOf(current) + 1] ?? "";
    if (field === "status") setStatus(next);
    else setRole(next);
    setPage(1);
  };
  const retry = () => {
    setStatus("");
    setRole("");
    setPage(1);
    setAttempt((value) => value + 1);
  };
  return { user, result, failed, retry, page, setPage, status, role, cycle };
}
