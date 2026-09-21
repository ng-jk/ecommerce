import React from "react";
import { router } from "expo-router";
import { Page, Heading, Button } from "@portfolio/storefront";
export default function NotFound() {
  return (
    <Page>
      <Heading>That page has moved.</Heading>
      <Button title="Back to shop" onPress={() => router.replace("/")} />
    </Page>
  );
}
