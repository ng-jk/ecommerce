import { router } from "expo-router";
import { Button,Heading,Page } from "../components/ui";
export function MenuScreen() {
  return (
    <Page>
      <Heading>Where next?</Heading>
      <Button title="Shop" onPress={() => router.push("/")} />
      <Button title="Bag" onPress={() => router.push("/cart")} />
      <Button title="Account" onPress={() => router.push("/account")} />
      <Button title="Orders" onPress={() => router.push("/orders")} />
    </Page>
  );
}
