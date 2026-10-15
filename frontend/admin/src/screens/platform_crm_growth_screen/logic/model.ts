import type {
  CrmActivity,
  CrmDeal,
  CrmPipeline,
  CrmStage,
} from "@portfolio/api-client";

export type GrowthKind = "pipelines" | "stages" | "deals" | "activities";
export type GrowthRecord = CrmPipeline | CrmStage | CrmDeal | CrmActivity;
export const growthLabel: Record<GrowthKind, string> = {
  pipelines: "Pipelines",
  stages: "Stages",
  deals: "Deals",
  activities: "Activities",
};
export const growthSingular: Record<GrowthKind, string> = {
  pipelines: "Pipeline",
  stages: "Stage",
  deals: "Deal",
  activities: "Activity",
};
export const growthPath = (
  organizationId: string,
  kind: GrowthKind,
  recordId?: string | number,
) =>
  `/platform/organizations/${organizationId}/crm/${kind}${recordId === undefined ? "" : `/${recordId}`}`;
export const growthRecordLabel = (record: GrowthRecord) =>
  "title" in record
    ? record.title
    : "summary" in record
      ? record.summary
      : record.name;
