import type { BuiltinShopSlug } from "@portfolio/api-client";
import React, { useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";
import {
  loadDeploymentProfile,
  parseDeploymentProfile,
  type DeploymentProfile,
} from "../../../services/profile";
import { StoreProvider } from "./StoreProvider";

type State =
  | { status: "loading" }
  | { status: "ready"; profile: DeploymentProfile | null }
  | { status: "error" };

export function ProfiledStoreProvider({
  defaultShop,
  children,
  required = false,
}: {
  defaultShop: BuiltinShopSlug;
  children: React.ReactNode;
  required?: boolean;
}) {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    let active = true;
    const configured = process.env.EXPO_PUBLIC_SHOP3I_PROFILE_JSON;
    const load = async () => {
      if (Platform.OS === "web") return loadDeploymentProfile(fetch, required);
      if (configured) return parseDeploymentProfile(JSON.parse(configured));
      if (required) throw new Error("Deployment profile unavailable");
      return null;
    };
    void load()
      .then((profile) => {
        if (active) setState({ status: "ready", profile });
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [required]);
  if (state.status === "loading")
    return <View accessibilityLabel="Loading Shop profile" />;
  if (state.status === "error")
    return (
      <View>
        <Text>Shop profile unavailable.</Text>
      </View>
    );
  return (
    <StoreProvider
      shop={state.profile?.shop ?? defaultShop}
      profile={state.profile}
    >
      {children}
    </StoreProvider>
  );
}
