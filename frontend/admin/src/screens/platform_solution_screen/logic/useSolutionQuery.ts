import { errorMessage } from "@portfolio/api-client";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

export function useSolutionQuery<T>(enabled: boolean, load: () => Promise<T>) {
  const [generation, setGeneration] = useState(0);
  const [result, setResult] = useState<{ generation: number; value: T } | null>(
    null,
  );
  const [error, setError] = useState("");
  useFocusEffect(
    useCallback(() => {
      setResult(null);
      setError("");
      if (!enabled) return;
      let active = true;
      void load()
        .then((value) => {
          if (active) setResult({ generation, value });
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
    result: result?.generation === generation ? result.value : null,
    error,
    retry: () => setGeneration((value) => value + 1),
  };
}
