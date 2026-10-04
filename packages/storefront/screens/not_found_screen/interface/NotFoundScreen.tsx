import { router } from "expo-router";
import { Button, Heading, Page } from "../../store_shell_screen";

export function NotFoundScreen() {
  return (
    <Page>
      <Heading>That page has moved.</Heading>
      <Button title="Back to shop" onPress={() => router.replace("/")} />
    </Page>
  );
}
