import { useEffect, useState } from "react";
import type { MiniappClient, Launch } from "../../../services/miniapps";
import { validateLaunch } from "../../../services/miniapps";
import { resolveAssetOrigin } from "../../../services/runtime";

export function useLaunch(
  client: MiniappClient,
  miniappId: string,
  scope: string,
  origin: string,
) {
  const identity = `${scope}:${miniappId}:${origin}`;
  const [state, setState] = useState<{
    identity: string;
    launch: Launch | null;
    error: string;
  }>({ identity, launch: null, error: "" });
  useEffect(() => {
    let active = true;

    void resolveAssetOrigin(origin)
      .then(async (expected) => ({
        expected,
        result: await client.launch(miniappId),
      }))
      .then(({ expected, result }) => {
        if (active)
          setState({
            identity,
            launch: validateLaunch(result.launch, expected),
            error: "",
          });
      })
      .catch(() => {
        if (active)
          setState({
            identity,
            launch: null,
            error: "MiniApp could not be launched.",
          });
      });
    return () => {
      active = false;
    };
  }, [client, miniappId, identity, origin]);
  return state.identity === identity
    ? state
    : { identity, launch: null, error: "" };
}
