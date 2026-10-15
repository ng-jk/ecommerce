import { router, useLocalSearchParams } from "expo-router";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import { usePlatformOrganization } from "../logic/usePlatformOrganization";
import { PlatformOrganizationForm } from "./OrganizationForm";

export function PlatformOrganizationEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const model = usePlatformOrganization(id);
  return (
    <PlatformPage title="Edit organization">
      {!model.user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : model.result ? (
        model.result.can_update ? (
          <PlatformOrganizationForm initial={model.result.organization} />
        ) : (
          <PlatformText>Owner access is required.</PlatformText>
        )
      ) : model.error ? (
        <>
          <PlatformText>{model.error}</PlatformText>
          <PlatformButton title="Retry" onPress={model.retry} />
        </>
      ) : (
        <PlatformText>Loading organization…</PlatformText>
      )}
    </PlatformPage>
  );
}
