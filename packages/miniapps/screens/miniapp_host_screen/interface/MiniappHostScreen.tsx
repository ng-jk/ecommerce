import { useEffect, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import type { MiniappClient, Launch } from "../../../services/miniapps";
import { mountWebFrame } from "../../../services/miniapps";
import { useLaunch } from "../logic/useLaunch";

export function Frame({
  client,
  id,
  launch,
  origin,
}: {
  client: MiniappClient;
  id: string;
  launch: Launch;
  origin: string;
}) {
  const ref = useRef<View>(null);
  useEffect(() => {
    const node = ref.current;
    if (!(node instanceof HTMLElement)) return;
    return mountWebFrame(
      node,
      launch,
      origin,
      async (name, input) =>
        (await client.invoke(id, launch.id, name, input)).response,
    );
  }, [client, id, launch, origin]);
  return <View ref={ref} style={{ minHeight: 500 }} />;
}

export function MiniappHostScreen({
  client,
  id,
  scope,
  origin,
  onBack,
}: {
  client: MiniappClient;
  id: string;
  scope: string;
  origin: string;
  onBack: () => void;
}) {
  const state = useLaunch(client, id, scope, origin);
  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Pressable accessibilityRole="button" onPress={onBack}>
        <Text>← MiniApps</Text>
      </Pressable>
      {state.error ? (
        <Text>{state.error}</Text>
      ) : state.launch ? (
        <Frame
          key={`${scope}.${id}.${state.launch.id}.${state.launch.digest}`}
          client={client}
          id={id}
          launch={state.launch}
          origin={state.launch.origin}
        />
      ) : (
        <Text>Opening MiniApp…</Text>
      )}
    </View>
  );
}
