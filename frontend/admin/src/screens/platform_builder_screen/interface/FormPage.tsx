import { useLocalSearchParams } from "expo-router";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
  usePlatformSession,
} from "../../platform_shell_screen";
import { useBuilderRecord } from "../logic/useBuilderRecord";
import { BuilderForm } from "./Form";

export function BuilderCreatePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = usePlatformSession();
  return (
    <PlatformPage title="Create Builder page">
      {user ? (
        <BuilderForm organizationId={id} />
      ) : (
        <PlatformText>Sign in to create a page.</PlatformText>
      )}
    </PlatformPage>
  );
}

export function BuilderEditPage() {
  const { id, pageId } = useLocalSearchParams<{ id: string; pageId: string }>();
  const model = useBuilderRecord(id, pageId);
  return (
    <PlatformPage title="Edit Builder page">
      {!model.user ? (
        <PlatformText>Sign in to edit a page.</PlatformText>
      ) : model.result ? (
        <BuilderForm organizationId={id} initial={model.result.page} />
      ) : model.error ? (
        <>
          <PlatformText>{model.error}</PlatformText>
          <PlatformButton title="Retry" onPress={model.retry} />
        </>
      ) : (
        <PlatformText>Loading page…</PlatformText>
      )}
    </PlatformPage>
  );
}
