import { useCallback, useRef, useState } from "react";
import { errorMessage } from "@portfolio/api-client";
import { usePlatformSession } from "../../platform_shell_screen";
import { useSolutionQuery } from "./useSolutionQuery";

export function usePlatformSolutions(id: string) {
  const { api, user } = usePlatformSession();
  const [page, setPage] = useState(1);
  const purchases = useSolutionQuery(
    !!user,
    useCallback(() => api.solutions.purchases(id, page), [api, id, page]),
  );
  return { user, page, setPage, purchases };
}

export function usePlatformSolution(id: string, purchaseId: string) {
  const { api, user } = usePlatformSession();
  const [busy, setBusy] = useState(false);
  const retryInFlight = useRef(false);
  const [error, setError] = useState("");
  const purchase = useSolutionQuery(
    !!user,
    useCallback(
      () => api.solutions.purchase(id, purchaseId),
      [api, id, purchaseId],
    ),
  );
  async function retry() {
    if (retryInFlight.current) return;
    retryInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await api.solutions.retry(id, purchaseId);
      purchase.retry();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      retryInFlight.current = false;
      setBusy(false);
    }
  }
  return { user, purchase, busy, error, retry };
}
