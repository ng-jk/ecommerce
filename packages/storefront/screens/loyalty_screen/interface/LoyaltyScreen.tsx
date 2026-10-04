import { router } from "expo-router";
import {
  Button,
  Copy,
  Heading,
  Page,
  Panel,
  useStore,
} from "../../store_shell_screen";
import { useLoyalty } from "../logic/useLoyalty";
export function LoyaltyScreen() {
  const { shop, user } = useStore();
  return <LoyaltySession key={`${shop}.${user?.id ?? "guest"}`} />;
}
function LoyaltySession() {
  const { points, state, reload } = useLoyalty();
  return (
    <Page navigationPath="/menu" navigationTitle="Menu">
      <Heading>Loyalty points</Heading>
      {state === "loading" && <Copy>Loading your balance…</Copy>}
      {state === "available" && (
        <Panel>
          <Copy>{points} points</Copy>
        </Panel>
      )}
      {state === "unavailable" && (
        <Copy>Loyalty points are unavailable for this account.</Copy>
      )}
      {state === "error" && (
        <>
          <Copy>Could not load your balance.</Copy>
          <Button title="Retry" onPress={reload} />
        </>
      )}
      <Button title="Account" onPress={() => router.replace("/account")} />
    </Page>
  );
}
