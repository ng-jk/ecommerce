import { useLocalSearchParams } from "expo-router";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
  usePlatformSession,
} from "../../platform_shell_screen";
import { growthSingular, type GrowthKind } from "../logic/model";
import { useGrowthOptions } from "../logic/useGrowthOptions";
import { useGrowthRecord } from "../logic/useGrowthRecord";
import { GrowthForm } from "./Form";

export function GrowthCreatePage({ kind }: { kind: GrowthKind }) {
  const {
    id,
    pipelineId = "",
    dealId = "",
  } = useLocalSearchParams<{
    id: string;
    pipelineId?: string;
    dealId?: string;
  }>();
  const { user } = usePlatformSession();
  const choices = useGrowthOptions(id, kind, pipelineId);
  return (
    <PlatformPage title={`Create ${growthSingular[kind].toLowerCase()}`}>
      {!user ? (
        <PlatformText>Sign in to create a CRM record.</PlatformText>
      ) : kind === "stages" && !pipelineId ? (
        <PlatformText>Open a pipeline first to add a stage.</PlatformText>
      ) : choices.error ? (
        <>
          <PlatformText>{choices.error}</PlatformText>
          <PlatformButton title="Retry" onPress={choices.retry} />
        </>
      ) : (
        <GrowthForm
          organizationId={id}
          kind={kind}
          pipelineId={pipelineId}
          dealId={dealId}
          options={choices.result ?? {}}
        />
      )}
    </PlatformPage>
  );
}

export function GrowthEditPage({
  kind,
}: {
  kind: Exclude<GrowthKind, "activities">;
}) {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const model = useGrowthRecord(id, kind, recordId);
  return (
    <PlatformPage title={`Edit ${growthSingular[kind].toLowerCase()}`}>
      {!model.user ? (
        <PlatformText>Sign in to edit a CRM record.</PlatformText>
      ) : model.result ? (
        <GrowthForm
          organizationId={id}
          kind={kind}
          initial={model.result.record}
        />
      ) : model.error ? (
        <>
          <PlatformText>{model.error}</PlatformText>
          <PlatformButton title="Retry" onPress={model.retry} />
        </>
      ) : (
        <PlatformText>Loading CRM record…</PlatformText>
      )}
    </PlatformPage>
  );
}
