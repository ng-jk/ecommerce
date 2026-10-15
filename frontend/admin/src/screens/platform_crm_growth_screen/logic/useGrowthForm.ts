import { ApiError, errorMessage } from "@portfolio/api-client";
import { router } from "expo-router";
import { useState } from "react";
import { usePlatformSession } from "../../platform_shell_screen";
import { growthPath, type GrowthKind, type GrowthRecord } from "./model";

const positive = (value: string, field: string): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error(`Enter a valid ${field}.`);
  return parsed;
};
const optionalId = (value: string, field: string): number | null =>
  value.trim() === "" ? null : positive(value, field);

export function useGrowthForm(
  organizationId: string,
  kind: GrowthKind,
  initial?: GrowthRecord,
  initialPipelineId = "",
  initialDealId = "",
) {
  const { api } = usePlatformSession();
  const [code, setCode] = useState(
    "code" in (initial ?? {}) ? (initial as { code: string }).code : "",
  );
  const [name, setName] = useState(
    "name" in (initial ?? {}) ? (initial as { name: string }).name : "",
  );
  const [pipelineId, setPipelineId] = useState(
    "pipeline_id" in (initial ?? {})
      ? String((initial as { pipeline_id: number }).pipeline_id)
      : initialPipelineId,
  );
  const [position, setPosition] = useState(
    "position" in (initial ?? {})
      ? String((initial as { position: number }).position)
      : "",
  );
  const [outcome, setOutcome] = useState(
    "outcome" in (initial ?? {})
      ? (initial as { outcome: string }).outcome
      : "",
  );
  const [stageId, setStageId] = useState(
    "stage_id" in (initial ?? {})
      ? String((initial as { stage_id: number }).stage_id)
      : "",
  );
  const [title, setTitle] = useState(
    "title" in (initial ?? {}) ? (initial as { title: string }).title : "",
  );
  const [companyId, setCompanyId] = useState(
    "company_id" in (initial ?? {})
      ? String((initial as { company_id: number | null }).company_id ?? "")
      : "",
  );
  const [assigneeId, setAssigneeId] = useState(
    "assignee_platform_user_id" in (initial ?? {})
      ? String(
          (initial as { assignee_platform_user_id: number | null })
            .assignee_platform_user_id ?? "",
        )
      : "",
  );
  const [amountMinor, setAmountMinor] = useState(
    "amount_minor" in (initial ?? {})
      ? String((initial as { amount_minor: number }).amount_minor)
      : "",
  );
  const [currency, setCurrency] = useState(
    "currency" in (initial ?? {})
      ? (initial as { currency: string }).currency
      : "",
  );
  const [dealId, setDealId] = useState(initialDealId);
  const [type, setType] = useState("");
  const [summary, setSummary] = useState("");
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const cycle = (
    field: "outcome" | "type",
    options: Record<string, string>,
  ) => {
    const keys = Object.keys(options);
    const current = field === "outcome" ? outcome : type;
    const next = keys[(keys.indexOf(current) + 1) % keys.length] ?? "";
    if (field === "outcome") setOutcome(next);
    else setType(next);
  };
  const save = async () => {
    setBusy(true);
    setMessage("");
    setFieldErrors({});
    try {
      let id: number;
      if (kind === "pipelines") {
        const result =
          initial && "version" in initial
            ? await api.crm.updatePipeline(organizationId, initial.id, {
                name,
                expected_version: initial.version,
              })
            : await api.crm.createPipeline(organizationId, {
                code: code.toLowerCase().trim(),
                name,
              });
        id = result.pipeline.id;
      } else if (kind === "stages") {
        const result =
          initial && "version" in initial
            ? await api.crm.updateStage(organizationId, initial.id, {
                name,
                expected_version: initial.version,
              })
            : await api.crm.createStage(organizationId, {
                pipeline_id: positive(pipelineId, "pipeline ID"),
                code: code.toLowerCase().trim(),
                name,
                position: positive(position, "position"),
                outcome,
              });
        id = result.stage.id;
      } else if (kind === "deals") {
        const common = {
          title,
          company_id: optionalId(companyId, "company ID"),
          contact_id:
            initial && "contact_id" in initial ? initial.contact_id : null,
          assignee_platform_user_id: optionalId(assigneeId, "assignee ID"),
          amount_minor: Number(amountMinor),
          currency: currency.toUpperCase().trim(),
        };
        const result =
          initial && "version" in initial
            ? await api.crm.updateDeal(organizationId, initial.id, {
                ...common,
                expected_version: initial.version,
              })
            : await api.crm.createDeal(organizationId, {
                ...common,
                pipeline_id: positive(pipelineId, "pipeline ID"),
                stage_id: positive(stageId, "stage ID"),
              });
        id = result.deal.id;
      } else {
        const result = await api.crm.createActivity(organizationId, {
          deal_id: positive(dealId, "deal ID"),
          type,
          summary,
          occurred_at: occurredAt,
        });
        id = result.activity.id;
      }
      router.replace(growthPath(organizationId, kind, id));
    } catch (reason) {
      if (reason instanceof ApiError) setFieldErrors(reason.validation_error);
      setMessage(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  return {
    code,
    setCode,
    name,
    setName,
    pipelineId,
    setPipelineId,
    position,
    setPosition,
    outcome,
    stageId,
    setStageId,
    title,
    setTitle,
    companyId,
    setCompanyId,
    assigneeId,
    setAssigneeId,
    amountMinor,
    setAmountMinor,
    currency,
    setCurrency,
    dealId,
    setDealId,
    type,
    summary,
    setSummary,
    occurredAt,
    setOccurredAt,
    busy,
    message,
    fieldErrors,
    cycle,
    save,
  };
}
