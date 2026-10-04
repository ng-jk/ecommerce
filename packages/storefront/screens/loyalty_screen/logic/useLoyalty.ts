import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { loyaltyAvailable } from "../../../services/plugins";
import { useStore } from "../../store_shell_screen";

export function useLoyalty() {
  const { api, plugins, user } = useStore();
  const [points, setPoints] = useState<number | null>(null);
  const [state, setState] = useState<
    "loading" | "available" | "unavailable" | "error"
  >("loading");
  const load = useCallback(
    async (isActive: () => boolean) => {
      setPoints(null);
      setState("loading");
      if (!user || !api.assistant) {
        setState("unavailable");
        return;
      }
      try {
        const reply = await api.assistant({ discover: true }, user.id);
        if (!isActive()) return;
        if (!loyaltyAvailable(reply, user.role)) {
          setState("unavailable");
          return;
        }
        const result = await plugins.balance();
        if (isActive()) {
          setPoints(result.balance.points);
          setState("available");
        }
      } catch {
        if (isActive()) setState("error");
      }
    },
    [api, plugins, user],
  );
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void load(() => active);
      return () => {
        active = false;
      };
    }, [load]),
  );
  return {
    points,
    state,
    reload: () => {
      void load(() => true);
    },
  };
}
