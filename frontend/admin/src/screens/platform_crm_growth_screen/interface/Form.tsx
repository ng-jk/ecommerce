import { router } from "expo-router";
import {
  PlatformButton,
  PlatformField,
  PlatformText,
} from "../../platform_shell_screen";
import { useGrowthForm } from "../logic/useGrowthForm";
import { growthPath, type GrowthKind, type GrowthRecord } from "../logic/model";

export function GrowthForm({
  organizationId,
  kind,
  initial,
  options = {},
  pipelineId = "",
  dealId = "",
}: {
  organizationId: string;
  kind: GrowthKind;
  initial?: GrowthRecord;
  options?: Record<string, string>;
  pipelineId?: string;
  dealId?: string;
}) {
  const model = useGrowthForm(
    organizationId,
    kind,
    initial,
    pipelineId,
    dealId,
  );
  const errors = (field: string) =>
    model.fieldErrors[field]?.map((message, index) => (
      <PlatformText key={`${field}.${index}`}>{message}</PlatformText>
    ));
  return (
    <>
      {(kind === "pipelines" || kind === "stages") && !initial && (
        <>
          <PlatformField
            label="Code"
            value={model.code}
            onChangeText={model.setCode}
            autoCapitalize="none"
          />
          {errors("code")}
        </>
      )}
      {(kind === "pipelines" || kind === "stages") && (
        <>
          <PlatformField
            label="Name"
            value={model.name}
            onChangeText={model.setName}
          />
          {errors("name")}
        </>
      )}
      {kind === "stages" && !initial && (
        <>
          {pipelineId ? (
            <PlatformText>Pipeline ID: {pipelineId}</PlatformText>
          ) : (
            <PlatformField
              label="Pipeline ID"
              value={model.pipelineId}
              onChangeText={model.setPipelineId}
              keyboardType="number-pad"
            />
          )}
          {errors("pipeline_id")}
          <PlatformField
            label="Position"
            value={model.position}
            onChangeText={model.setPosition}
            keyboardType="number-pad"
          />
          {errors("position")}
          <PlatformButton
            title={`Outcome: ${options[model.outcome] ?? "Choose"}`}
            secondary
            onPress={() => model.cycle("outcome", options)}
          />
          {errors("outcome")}
        </>
      )}
      {kind === "deals" && (
        <>
          <PlatformField
            label="Title"
            value={model.title}
            onChangeText={model.setTitle}
          />
          {errors("title")}
          {!initial ? (
            <>
              <PlatformField
                label="Pipeline ID"
                value={model.pipelineId}
                onChangeText={model.setPipelineId}
                keyboardType="number-pad"
              />
              {errors("pipeline_id")}
              <PlatformField
                label="Starting stage ID"
                value={model.stageId}
                onChangeText={model.setStageId}
                keyboardType="number-pad"
              />
              {errors("stage_id")}
            </>
          ) : (
            <>
              <PlatformField
                label="Company ID (optional)"
                value={model.companyId}
                onChangeText={model.setCompanyId}
                keyboardType="number-pad"
              />
              {errors("company_id")}
              <PlatformField
                label="Assignee ID (optional)"
                value={model.assigneeId}
                onChangeText={model.setAssigneeId}
                keyboardType="number-pad"
              />
              {errors("assignee_platform_user_id")}
            </>
          )}
          <PlatformField
            label="Amount in minor units"
            value={model.amountMinor}
            onChangeText={model.setAmountMinor}
            keyboardType="number-pad"
          />
          {errors("amount_minor")}
          <PlatformField
            label="Currency code"
            value={model.currency}
            onChangeText={model.setCurrency}
            autoCapitalize="characters"
          />
          {errors("currency")}
        </>
      )}
      {kind === "activities" && (
        <>
          <PlatformField
            label="Deal ID"
            value={model.dealId}
            onChangeText={model.setDealId}
            keyboardType="number-pad"
          />
          {errors("deal_id")}
          <PlatformButton
            title={`Type: ${options[model.type] ?? "Choose"}`}
            secondary
            onPress={() => model.cycle("type", options)}
          />
          {errors("type")}
          <PlatformField
            label="Summary"
            value={model.summary}
            onChangeText={model.setSummary}
          />
          {errors("summary")}
          <PlatformField
            label="Occurred at (ISO 8601)"
            value={model.occurredAt}
            onChangeText={model.setOccurredAt}
            autoCapitalize="none"
          />
          {errors("occurred_at")}
        </>
      )}
      {errors("expected_version")}
      {!!model.message && <PlatformText>{model.message}</PlatformText>}
      <PlatformButton
        title={initial ? "Save changes" : "Create"}
        disabled={model.busy}
        onPress={() => void model.save()}
      />
      <PlatformButton
        title="Cancel"
        secondary
        onPress={() =>
          router.replace(growthPath(organizationId, kind, initial?.id))
        }
      />
    </>
  );
}
