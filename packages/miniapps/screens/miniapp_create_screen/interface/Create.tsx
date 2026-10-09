import { useEffect, useState } from "react";
import { ScrollView, Text } from "react-native";
import type { AdminListing, MiniappClient } from "../../../services/miniapps";
import { MiniappForm } from "../../miniapp_form_screen";
export function MiniappCreateScreen({
  client,
  packageId,
  page = 1,
  scope,
  onDone,
}: {
  client: MiniappClient;
  packageId: number;
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
      ? state.result?.catalog.data.find(
          (value) => value.package_id === packageId,
        )
      : undefined;
  const version = item?.versions[0];
  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
      <Text accessibilityRole="header" style={{ fontSize: 28 }}>
        Install MiniApp
      </Text>
      {item && version ? (
        <MiniappForm
          client={client}
          values={{
            packageId,
            name: item.name,
            version: version.version,
            enabled: true,
            available: version.capabilities,
            grants: [],
          }}
          onSaved={onDone}
        />
      ) : (
        <Text>
          {state.identity === identity && state.loaded
            ? "Approved package unavailable."
            : "Loading approved package…"}
        </Text>
      )}
    </ScrollView>
  );
}
