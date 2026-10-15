import { errorMessage } from "@portfolio/api-client";
import { useStore } from "@portfolio/storefront";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

export function useShopSolutionQuery<T>(
  load: () => Promise<T>,
  enabled = true,
) {
  const { run, shop, user } = useStore();
  const [generation, setGeneration] = useState(0);
  const [result, setResult] = useState<{ scope: string; value: T } | null>(
    null,
  );
  const [error, setError] = useState("");
  const scope = `${shop}.${user?.id ?? "guest"}.${generation}`;
  useFocusEffect(
    useCallback(() => {
      setResult(null);
      setError("");
      if (!enabled) return;
      let active = true;
      void run(async () => {
        const value = await load();
        if (active) setResult({ scope, value });
      })
        .then((ok) => {
          if (active && !ok) setError("Request failed. Please retry.");
        })
        .catch((reason) => {
          if (active) setError(errorMessage(reason));
        });
      return () => {
        active = false;
      };
    }, [enabled, load, run, scope]),
  );
  return {
    result: result?.scope === scope ? result.value : null,
    error,
    retry: () => setGeneration((value) => value + 1),
  };
}
