import { router, useLocalSearchParams } from "expo-router";
import { PlatformButton, PlatformPage } from "../../platform_shell_screen";
import { erpPath } from "../logic/model";

export function ErpHub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <PlatformPage title="General ledger">
      <PlatformButton
        title="Services"
        secondary
        onPress={() =>
          router.replace(`/platform/organizations/${id}/service-hub`)
        }
      />
      <PlatformButton
        title="Chart of accounts"
        onPress={() => router.push(erpPath(id, "accounts"))}
      />
      <PlatformButton
        title="Journals"
        onPress={() => router.push(erpPath(id, "journals"))}
      />
    </PlatformPage>
  );
}
