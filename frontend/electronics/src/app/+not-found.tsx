import { Button,Heading,Page } from "@portfolio/storefront";
import { router } from "expo-router";
export default function NotFound() {
  return (
    <Page>
      <Heading>That page has moved.</Heading>
      <Button title="Back to shop" onPress={() => router.replace("/")} />
    </Page>
  );
}
