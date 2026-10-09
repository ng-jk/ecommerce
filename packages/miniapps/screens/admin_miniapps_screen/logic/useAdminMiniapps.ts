import { useEffect, useState } from "react";
import type { AdminListing, MiniappClient } from "../../../services/miniapps";
export function useAdminMiniapps(client: MiniappClient, scope: string) {
  const [page, setPage] = useState(1);
  const identity = `${scope}:${page}`;
  const [state, setState] = useState<{
    identity: string;
    result: AdminListing | null;
    error: string;
  }>({ identity, result: null, error: "" });
  useEffect(() => {
    let live = true;
    void client
      .adminList(page)
      .then((result) => {
        if (live) setState({ identity, result, error: "" });
      })
      .catch(() => {
        if (live)
          setState({
            identity,
            result: null,
            error: "MiniApps could not be loaded.",
          });
      });
    return () => {
      live = false;
    };
  }, [client, identity, page]);
  return {
    ...(state.identity === identity
      ? state
      : { identity, result: null, error: "" }),
    page,
    setPage,
  };
}
