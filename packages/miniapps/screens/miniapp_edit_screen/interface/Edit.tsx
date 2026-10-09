import { useEffect, useState } from "react";
import { ScrollView, Text } from "react-native";
import type { AdminListing, MiniappClient } from "../../../services/miniapps";
import { MiniappForm } from "../../miniapp_form_screen";
export function MiniappEditScreen({
  client,
  id,
  page = 1,
  scope,
  onDone,
}: {
  client: MiniappClient;
  id: number;
  page?: number;
  scope: string;
  onDone: () => void;
}) {
  const identity = `${scope}:${page}`;
  const [state, setState] = useState<{
    identity: string;
    result: AdminListing | null;
    loaded: boolean;
  }>({ identity, result: null, loaded: false });
  useEffect(() => {
    let live = true;
    void client
      .adminList(page)
      .then((result) => {
        if (live) setState({ identity, result, loaded: true });
      })
      .catch(() => {
        if (live) setState({ identity, result: null, loaded: true });
      });
    return () => {
      live = false;
    };
  }, [client, identity, page]);
  const item =
    state.identity === identity
      ? state.result?.miniapps.data.find((value) => value.id === id)
      : undefined;
  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
      <Text accessibilityRole="header" style={{ fontSize: 28 }}>
        Edit MiniApp
      </Text>
      {item ? (
        <MiniappForm
          client={client}
          values={{
            id: item.id,
            packageId: item.package_id,
            name: item.name,
            version: item.version,
            enabled: item.enabled,
            available: item.capabilities,
            grants: item.grants,
            configVersion: item.config_version,
          }}
          onSaved={onDone}
        />
      ) : (
        <Text>
          {state.identity === identity && state.loaded
            ? "Installation unavailable."
            : "Loading installation…"}
        </Text>
      )}
    </ScrollView>
  );
}
