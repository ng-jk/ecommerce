import { Pressable, ScrollView, Text, View } from "react-native";
import type { MiniappClient } from "../../../services/miniapps";
import { useAdminMiniapps } from "../logic/useAdminMiniapps";
export function AdminMiniappsScreen({
  client,
  scope,
  onBack,
  onCreate,
  onEdit,
}: {
  client: MiniappClient;
  scope: string;
  onBack: () => void;
  onCreate: (id: number, page: number) => void;
  onEdit: (id: number, page: number) => void;
}) {
  const { result, error, page, setPage } = useAdminMiniapps(client, scope);
  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
      <Pressable accessibilityRole="button" onPress={onBack}>
        <Text>← Dashboard</Text>
      </Pressable>
      <Text accessibilityRole="header" style={{ fontSize: 28 }}>
        MiniApps
      </Text>
      {error ? (
        <Text>{error}</Text>
      ) : !result ? (
        <Text>Loading…</Text>
      ) : (
        <>
          <Text>Installed</Text>
          {result.miniapps.data.length === 0 ? (
            <Text>No MiniApps installed.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {result.miniapps.data.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  onPress={() => onEdit(item.id, page)}
                >
                  <Text>
                    {item.name} · {item.enabled ? "Enabled" : "Disabled"} · Edit
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          <Text>Available packages</Text>
          {result.catalog.data.length === 0 ? (
            <Text>No approved packages available.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {result.catalog.data.map((item) => (
                <Pressable
                  key={item.package_id}
                  accessibilityRole="button"
                  onPress={() => onCreate(item.package_id, page)}
                >
                  <Text>{item.name} · Install</Text>
                </Pressable>
              ))}
            </View>
          )}
          <View style={{ flexDirection: "row", gap: 16 }}>
            <Pressable
              accessibilityRole="button"
              disabled={page <= 1}
              onPress={() => setPage((p) => p - 1)}
            >
              <Text>Previous</Text>
            </Pressable>
            <Text>
              {page} /{" "}
              {Math.max(
                result.miniapps.meta.last_page,
                result.catalog.meta.last_page,
                1,
              )}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={
                page >=
                Math.max(
                  result.miniapps.meta.last_page,
                  result.catalog.meta.last_page,
                )
              }
              onPress={() => setPage((p) => p + 1)}
            >
              <Text>Next</Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}
