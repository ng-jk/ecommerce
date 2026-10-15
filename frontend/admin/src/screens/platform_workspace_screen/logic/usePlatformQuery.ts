import { errorMessage } from "@portfolio/api-client";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

export function usePlatformQuery<T>(enabled: boolean, load: () => Promise<T>) {
  const [loaded, setLoaded] = useState<{ generation: number; value: T } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [generation, setGeneration] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setLoaded(null);
      setError("");
      if (!enabled) return;
      let active = true;
      void load()
        .then((value) => {
          if (active) setLoaded({ generation, value });
        })
        .catch((reason) => {
          if (active) setError(errorMessage(reason));
        });
      return () => {
        active = false;
      };
    }, [enabled, load, generation]),
  );
  return {
    result: loaded?.generation === generation ? loaded.value : null,
    error,
    retry: () => setGeneration((value) => value + 1),
  };
}
