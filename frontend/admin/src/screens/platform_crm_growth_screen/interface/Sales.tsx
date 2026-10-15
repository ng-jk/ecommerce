import { router, useLocalSearchParams } from "expo-router";
import { PlatformButton, PlatformPage } from "../../platform_shell_screen";
import { growthPath, growthLabel, type GrowthKind } from "../logic/model";

export function CrmSales() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const kinds: GrowthKind[] = ["pipelines", "stages", "deals", "activities"];
  return (
    <PlatformPage title="Sales">
      <PlatformButton
        title="CRM"
        secondary
        onPress={() => router.replace(`/platform/organizations/${id}/crm`)}
      />
      {kinds.map((kind) => (
        <PlatformButton
          key={kind}
          title={growthLabel[kind]}
          onPress={() => router.push(growthPath(id, kind))}
        />
      ))}
    </PlatformPage>
  );
}
