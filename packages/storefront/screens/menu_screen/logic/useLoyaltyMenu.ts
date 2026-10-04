import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { loyaltyAvailable } from "../../../services/plugins";
import { useStore } from "../../store_shell_screen";
export function useLoyaltyMenu() {
  const { api, user, shop } = useStore();
  const scope = `${shop}.${user?.id ?? "guest"}`;
  const [discoveredScope, setDiscoveredScope] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setDiscoveredScope(null);
      if (user && api.assistant)
        void api
          .assistant({ discover: true }, user.id)
          .then((reply) => {
            if (active)
              setDiscoveredScope(
                loyaltyAvailable(reply, user.role) ? scope : null,
              );
          })
          .catch(() => {
            if (active) setDiscoveredScope(null);
          });
      return () => {
        active = false;
      };
    }, [api, user, scope]),
  );
  return discoveredScope === scope;
}
