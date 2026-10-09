import { Pressable, Text, View } from "react-native";
import type { Capability, MiniappClient } from "../../../services/miniapps";
import {
  useMiniappForm,
  type MiniappFormValues,
} from "../logic/useMiniappForm";
export function MiniappForm({
  client,
  values,
  onSaved,
}: {
  client: MiniappClient;
  values: MiniappFormValues & { name: string; available: Capability[] };
  onSaved: () => void;
}) {
  const state = useMiniappForm(client, values, onSaved);
  return (
    <View style={{ gap: 16 }}>
      <Text>
        {values.name} · {values.version}
      </Text>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: state.enabled }}
        onPress={() => state.setEnabled(!state.enabled)}
      >
        <Text>{state.enabled ? "Enabled" : "Disabled"}</Text>
      </Pressable>
      <Text>Allow read access</Text>
      <View style={{ gap: 8 }}>
        {values.available.map((cap) => (
          <Pressable
            key={cap}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: state.grants.includes(cap) }}
            onPress={() => state.toggle(cap)}
          >
            <Text>
              {state.grants.includes(cap) ? "☑" : "☐"} {cap}
            </Text>
          </Pressable>
        ))}
      </View>
      {state.error ? <Text>{state.error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={state.busy}
        onPress={() => {
          void state.submit();
        }}
      >
        <Text>Save</Text>
      </Pressable>
    </View>
  );
}
