import { useEffect, useState } from "react";
import type { MiniappClient, Miniapp } from "../../../services/miniapps";

export function useMiniapps(client: MiniappClient, scope: string) {
  const [page, setPage] = useState(1);
  const identity = `${scope}:${page}`;
  const [state, setState] = useState<{
    identity: string;
    items: Miniapp[];
    last: number;
    error: string;
    loading: boolean;
  }>({ identity, items: [], last: 1, error: "", loading: true });
  useEffect(() => {
    let active = true;

    void client
      .list(page)
      .then((result) => {
        if (active)
          setState({
            identity,
            items: result.miniapps.data,
            last: result.miniapps.meta.last_page,
            error: "",
            loading: false,
          });
      })
      .catch(() => {
        if (active)
          setState({
            identity,
            items: [],
            last: 1,
            error: "MiniApps could not be loaded.",
            loading: false,
          });
      });
    return () => {
      active = false;
    };
  }, [client, page, identity]);
  const current =
    state.identity === identity
      ? state
      : { identity, items: [], last: 1, error: "", loading: true };
  return { ...current, page, setPage };
}
