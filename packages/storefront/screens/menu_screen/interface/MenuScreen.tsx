import { router } from "expo-router";
import { Button, Heading, Page } from "../../store_shell_screen";
import { useLoyaltyMenu } from "../logic/useLoyaltyMenu";
export function MenuScreen() {
  const loyalty = useLoyaltyMenu();
  return (
    <Page>
      <Heading>Where next?</Heading>
      <Button title="Shop" onPress={() => router.push("/")} />
      <Button title="Bag" onPress={() => router.push("/cart")} />
      <Button title="Account" onPress={() => router.push("/account")} />
      <Button title="Orders" onPress={() => router.push("/orders")} />
      <Button title="Assistant" onPress={() => router.push("/assistant")} />
      {loyalty && (
        <Button
          title="Loyalty points"
          onPress={() => router.push("/loyalty")}
        />
      )}
    </Page>
  );
}
