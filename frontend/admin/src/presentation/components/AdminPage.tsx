import { Copy, Heading, useStore } from "@portfolio/storefront";
import React from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
export function AdminPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { theme, message } = useStore();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView
        contentContainerStyle={{
          padding: 28,
          gap: 20,
          maxWidth: 1000,
          width: "100%",
          alignSelf: "center",
        }}
      >
        <Heading>{title}</Heading>
        {!!message && <Copy>{message}</Copy>}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
