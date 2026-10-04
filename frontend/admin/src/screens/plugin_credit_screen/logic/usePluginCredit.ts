import { useStore } from "@portfolio/storefront";
import { useEffect, useState } from "react";
export function usePluginCredit() {
  const { plugins, api, run, user, busy, shop } = useStore();
  const [userId, setUserId] = useState("");
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const scope = `${shop}.${user?.id ?? "guest"}`;
  const [discovery, setDiscovery] = useState<{
    scope: string;
    available: boolean;
  } | null>(null);
  const available = discovery?.scope === scope && discovery.available;
  useEffect(() => {
    let active = true;
    if (user?.role === "admin" && api.assistant)
      void api
        .assistant({ discover: true }, user.id)
        .then((reply) => {
          if (active)
            setDiscovery({
              scope,
              available: reply.available_actions.some(
                (action) =>
                  action.name === "creditLoyalty" &&
                  action.allowed_roles.includes("admin"),
              ),
            });
        })
        .catch(() => {
          if (active) setDiscovery({ scope, available: false });
        });
    return () => {
      active = false;
    };
  }, [api, user, scope]);
  const submit = () =>
    run(async () => {
      const id = Number(userId),
        amount = Number(points);
      if (
        !Number.isInteger(id) ||
        id < 1 ||
        !Number.isInteger(amount) ||
        amount < 1 ||
        amount > 10000 ||
        reason.trim().length === 0 ||
        reason.length > 200
      )
        throw new Error(
          "Enter a valid customer ID, 1–10,000 points, and a reason up to 200 characters.",
        );
      if (!user || user.role !== "admin" || !available)
        throw new Error("Loyalty credit is unavailable.");
      const result = await plugins.credit(user.id, id, amount, reason.trim());
      setBalance(result.balance.points);
      setPoints("");
      setReason("");
    });
  return {
    user,
    available,
    busy,
    userId,
    setUserId,
    points,
    setPoints,
    reason,
    setReason,
    balance,
    submit,
  };
}
