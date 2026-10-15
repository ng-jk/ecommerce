import { router, useLocalSearchParams } from "expo-router";
import {
  PlatformButton,
  PlatformField,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import {
  growthLabel,
  growthPath,
  growthRecordLabel,
  growthSingular,
  type GrowthKind,
} from "../logic/model";
import { useGrowthDirectory } from "../logic/useGrowthDirectory";

export function GrowthDirectory({ kind }: { kind: GrowthKind }) {
  const {
    id,
    pipelineId = "",
    dealId = "",
  } = useLocalSearchParams<{
    id: string;
    pipelineId?: string;
    dealId?: string;
  }>();
  const model = useGrowthDirectory(id, kind, pipelineId, dealId);
  const result = model.result;
  return (
    <PlatformPage title={growthLabel[kind]}>
      <PlatformButton
        title="Sales"
        secondary
        onPress={() =>
          router.replace(`/platform/organizations/${id}/crm/sales`)
        }
      />
      {!model.user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : (
        <>
          <PlatformButton
            title={`Create ${growthSingular[kind].toLowerCase()}`}
            disabled={kind === "stages" && !model.pipelineId}
            onPress={() =>
              router.push(
                `${growthPath(id, kind)}/create${
                  kind === "stages" && model.pipelineId
                    ? `?pipelineId=${encodeURIComponent(model.pipelineId)}`
                    : kind === "activities" && dealId
                      ? `?dealId=${encodeURIComponent(dealId)}`
                      : ""
                }`,
              )
            }
          />
          {(kind === "stages" || kind === "deals") && (
            <PlatformField
              label="Pipeline ID"
              value={model.pipelineId}
              onChangeText={model.changePipeline}
              keyboardType="number-pad"
            />
          )}
          {result ? (
            <>
              {kind === "activities" && (
                <PlatformButton
                  title={`Filter: ${model.filter ? (model.choices?.[model.filter] ?? "Unavailable") : "All"}`}
                  secondary
                  onPress={model.cycleFilter}
                />
              )}
              {result.data.length === 0 && (
                <PlatformText>No {kind} on this page.</PlatformText>
              )}
              {result.data.map((record) => (
                <PlatformButton
                  key={record.id}
                  title={`${growthRecordLabel(record)}${"code" in record ? ` · ${record.code}` : ""}`}
                  onPress={() => router.push(growthPath(id, kind, record.id))}
                />
              ))}
              <PlatformText>
                Page {model.page} of {result.meta.last_page}
              </PlatformText>
              <PlatformButton
                title="Previous"
                secondary
                disabled={model.page === 1}
                onPress={() => model.setPage(model.page - 1)}
              />
              <PlatformButton
                title="Next"
                secondary
                disabled={model.page >= result.meta.last_page}
                onPress={() => model.setPage(model.page + 1)}
              />
            </>
          ) : model.error ? (
            <>
              <PlatformText>{model.error}</PlatformText>
              <PlatformButton title="Retry" onPress={model.retry} />
            </>
          ) : (
            <PlatformText>Loading {kind}…</PlatformText>
          )}
        </>
      )}
    </PlatformPage>
  );
}
