import { useStore } from "@portfolio/storefront";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

export function useMembershipDetail(
  organizationId: string,
  membershipId: string,
) {
  const { api, run, busy, user, shop } = useStore();
  const [attempt, setAttempt] = useState(0);
  const scope = `${shop}.${user?.id ?? "guest"}.${organizationId}.${membershipId}.${attempt}`;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState<{
    scope: string;
    detail: Awaited<ReturnType<typeof api.platformWorkspace.membership>>;
  } | null>(null);
  useFocusEffect(
    useCallback(() => {
      setLoaded(null);
      setFailed(false);
      if (!user) return;
      let active = true;
      void run(async () => {
        const detail = await api.platformWorkspace.membership(
          organizationId,
          membershipId,
        );
        if (active) setLoaded({ scope, detail });
      }).then((ok) => {
        if (active && !ok) setFailed(true);
      });
      return () => {
        active = false;
      };
    }, [api, run, user, organizationId, membershipId, scope]),
  );
  const detail = loaded?.scope === scope ? loaded.detail : null;
  const accept = () =>
    run(async () => {
      if (!detail) return;
      await api.platformWorkspace.accept(organizationId, membershipId, {
        expected_version: detail.membership.version,
      });
      router.replace(
        `/organizations/${organizationId}/memberships/${membershipId}`,
      );
      setAttempt((value) => value + 1);
    });
  const revoke = () =>
    run(async () => {
      if (!detail) return;
      await api.platformWorkspace.revoke(organizationId, membershipId, {
        expected_version: detail.membership.version,
      });
      router.replace(`/organizations/${organizationId}/memberships`);
    });
  const canAccept =
    !!detail &&
    detail.membership.status === "invited" &&
    detail.membership.user?.kind === "shop" &&
    detail.membership.user.id === user?.id;
  return {
    user,
    detail,
    failed,
    retry: () => setAttempt((value) => value + 1),
    busy,
    accept,
    revoke,
    canAccept,
  };
}
