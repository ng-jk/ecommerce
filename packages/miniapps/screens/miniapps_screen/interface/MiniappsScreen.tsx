import { Pressable, ScrollView, Text, View } from "react-native";
import type { MiniappClient } from "../../../services/miniapps";
import { useMiniapps } from "../logic/useMiniapps";

export function MiniappsScreen({
  client,
  scope,
  onOpen,
  onBack,
}: {
  client: MiniappClient;
  scope: string;
  onOpen: (id: string) => void;
  onBack: () => void;
}) {
  const { items, loading, error, page, last, setPage } = useMiniapps(
    client,
    scope,
  );
  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 18 }}>
      <Pressable accessibilityRole="button" onPress={onBack}>
        <Text>← Store</Text>
      </Pressable>
      <Text
        accessibilityRole="header"
        style={{ fontSize: 28, fontWeight: "700" }}
      >
        MiniApps
      </Text>
      {loading ? (
        <Text>Loading MiniApps…</Text>
      ) : error ? (
        <Text>{error}</Text>
      ) : items.length === 0 ? (
        <Text>No MiniApps are available.</Text>
      ) : (
        <View style={{ gap: 12 }}>
          {items
            .filter((item) => item.enabled)
            .map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() => onOpen(String(item.id))}
                style={{
                  padding: 18,
                  borderWidth: 1,
                  borderColor: "#bbb",
                  borderRadius: 12,
                }}
              >
                <Text style={{ fontSize: 18 }}>{item.name}</Text>
                <Text>{item.slug}</Text>
              </Pressable>
            ))}
        </View>
      )}
      <View style={{ flexDirection: "row", gap: 20 }}>
        <Pressable
          accessibilityRole="button"
          disabled={page <= 1}
          onPress={() => setPage((p) => p - 1)}
        >
          <Text>Previous</Text>
        </Pressable>
        <Text>
          {page} / {Math.max(last, 1)}
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={page >= last}
          onPress={() => setPage((p) => p + 1)}
        >
          <Text>Next</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
