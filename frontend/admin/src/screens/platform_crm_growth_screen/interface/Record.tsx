import { router, useLocalSearchParams } from "expo-router";
import {
  PlatformButton,
  PlatformField,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import {
  growthPath,
  growthRecordLabel,
  growthSingular,
  type GrowthKind,
} from "../logic/model";
import { useGrowthRecord } from "../logic/useGrowthRecord";

export function GrowthRecordPage({ kind }: { kind: GrowthKind }) {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const model = useGrowthRecord(id, kind, recordId);
  const record = model.result?.record;
  return (
    <PlatformPage title={growthSingular[kind]}>
      <PlatformButton
        title={`All ${kind}`}
        secondary
        onPress={() => router.replace(growthPath(id, kind))}
      />
      {!model.user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : record ? (
        <>
          <PlatformText>{growthRecordLabel(record)}</PlatformText>
          {"code" in record && <PlatformText>Code: {record.code}</PlatformText>}
          {"position" in record && (
            <PlatformText>
              Position: {record.position} · Outcome:{" "}
              {model.result?.options?.outcome?.[record.outcome] ??
                "Unavailable"}
            </PlatformText>
          )}
          {"amount_minor" in record && (
            <PlatformText>
              {record.amount_minor} {record.currency} minor units ·{" "}
              {model.result?.options?.status?.[record.status] ?? "Unavailable"}
            </PlatformText>
          )}
          {"assignee_platform_user_id" in record && (
            <PlatformText>
              Assignee ID: {record.assignee_platform_user_id ?? "Unassigned"}
            </PlatformText>
          )}
          {"type" in record && (
            <PlatformText>
              Type:{" "}
              {model.result?.options?.type?.[record.type] ?? "Unavailable"}
            </PlatformText>
          )}
          {"occurred_at" in record && (
            <PlatformText>{record.occurred_at}</PlatformText>
          )}
          {kind !== "activities" && (
            <PlatformButton
              title="Edit"
              onPress={() =>
                router.push(`${growthPath(id, kind, record.id)}/edit`)
              }
            />
          )}
          {kind === "pipelines" && (
            <PlatformButton
              title="Stages"
              secondary
              onPress={() =>
                router.push(
                  `${growthPath(id, "stages")}?pipelineId=${record.id}`,
                )
              }
            />
          )}
          {kind === "stages" && "pipeline_id" in record && (
            <PlatformButton
              title="Pipeline"
              secondary
              onPress={() =>
                router.push(growthPath(id, "pipelines", record.pipeline_id))
              }
            />
          )}
          {kind === "deals" && "stage_id" in record && (
            <>
              <PlatformButton
                title="Stages"
                secondary
                onPress={() =>
                  router.push(
                    `${growthPath(id, "stages")}?pipelineId=${record.pipeline_id}`,
                  )
                }
              />
              <PlatformButton
                title="Activities"
                secondary
                onPress={() =>
                  router.push(
                    `${growthPath(id, "activities")}?dealId=${record.id}`,
                  )
                }
              />
              {record.status === "open" && (
                <>
                  <PlatformField
                    label="Next stage ID"
                    value={model.stageId}
                    onChangeText={model.setStageId}
                    keyboardType="number-pad"
                  />
                  <PlatformButton
                    title="Advance deal"
                    disabled={model.busy}
                    onPress={() => void model.advance()}
                  />
                </>
              )}
              {model.fieldErrors.stage_id?.map((message, index) => (
                <PlatformText key={index}>{message}</PlatformText>
              ))}
              {!!model.message && <PlatformText>{model.message}</PlatformText>}
            </>
          )}
          {kind === "activities" && "deal_id" in record && (
            <PlatformButton
              title="Deal"
              secondary
              onPress={() =>
                router.push(growthPath(id, "deals", record.deal_id))
              }
            />
          )}
        </>
      ) : model.error ? (
        <>
          <PlatformText>{model.error}</PlatformText>
          <PlatformButton title="Retry" onPress={model.retry} />
        </>
      ) : (
        <PlatformText>
          Loading {growthSingular[kind].toLowerCase()}…
        </PlatformText>
      )}
    </PlatformPage>
  );
}
