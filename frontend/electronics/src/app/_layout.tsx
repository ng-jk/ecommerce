import React from "react";
import { Stack } from "expo-router";
import { StoreProvider } from "@portfolio/storefront";
export default function Layout() {
  return (
    <StoreProvider shop="electronics">
      <Stack screenOptions={{ headerShown: false }} />
    </StoreProvider>
  );
}
