import React from "react";
import { Stack } from "expo-router";
import { StoreProvider } from "@portfolio/storefront";
export default function Layout() {
  return (
    <StoreProvider shop="fashion">
      <Stack screenOptions={{ headerShown: false }} />
    </StoreProvider>
  );
}
