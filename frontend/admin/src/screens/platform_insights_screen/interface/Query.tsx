import {
  type InsightDefinition,
  type InsightQueryResult,
} from "@portfolio/api-client";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  PlatformButton,
  PlatformField,
  PlatformPage,
  PlatformText,
  usePlatformSession,
} from "../../platform_shell_screen";
import { usePlatformQuery } from "../../platform_workspace_screen";
import { insightsError, insightsPath } from "../logic/model";
import { QueryOutput } from "./Pages";

export function InsightsQuery({ edit = false }: { edit?: boolean }) {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const { api, user } = usePlatformSession();
  const report = usePlatformQuery(
    !!user && edit,
    useCallback(
      () => api.insights.detail(id, "reports", recordId),
      [api, id, recordId],
    ),
  );
  const datasetId = edit ? report.result?.resource.dataset_id : recordId;
  const dataset = usePlatformQuery(
    !!user && !!datasetId,
    useCallback(
      () => api.insights.detail(id, "datasets", datasetId!),
      [api, id, datasetId],
    ),
  );
  const [changed, setChanged] = useState<InsightDefinition | null>(null);
  const definition = changed ??
    report.result?.resource.definition ?? {
      metric: { aggregate: "count" as const },
      limit: 50,
    };
  const [stage, setStage] = useState(0);
  const [filterIndex, setFilterIndex] = useState(0);
  const [operator, setOperator] = useState<"eq" | "gte" | "lte">("eq");
  const [value, setValue] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<
    "private" | "organization" | null
  >(null);
  const [status, setStatus] = useState<"active" | "disabled" | null>(null);
  const [result, setResult] = useState<InsightQueryResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const columns = dataset.result?.resource.schema ?? [];
  const integers = columns.filter((column) => column.type === "integer");
  const filter = columns[filterIndex]!;
  const change = (next: InsightDefinition) => {
    setChanged(next);
    setResult(null);
    setError("");
  };
  const addFilter = () => {
    try {
      let parsed: string | number | boolean = value;
      if (filter.type === "integer") {
        if (!/^-?(0|[1-9][0-9]*)$/.test(value))
          throw new Error("Enter an integer.");
        parsed = Number(value);
      }
      if (filter.type === "boolean") {
        if (!["true", "false"].includes(value))
          throw new Error("Enter true or false.");
        parsed = value === "true";
      }
      change({
        ...definition,
        filters: [
          ...(definition.filters ?? []),
          {
            column: filter.name,
            operator: filter.type === "integer" ? operator : "eq",
            value: parsed,
          },
        ],
      });
      setValue("");
    } catch (reason) {
      setError(insightsError(reason));
    }
  };
  const run = async () => {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(await api.insights.query(id, datasetId!, definition));
    } catch (reason) {
      setError(insightsError(reason));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const input = {
        name: name ?? report.result?.resource.name ?? "",
        visibility:
          visibility ?? report.result?.resource.visibility ?? "private",
        definition,
      };
      const saved =
        edit && report.result
          ? await api.insights.updateReport(id, recordId, {
              ...input,
              expected_version: report.result.resource.version,
              status: status ?? report.result.resource.status,
            })
          : await api.insights.createReport(id, {
              ...input,
              dataset_id: Number(datasetId),
            });
      router.replace(insightsPath(id, `reports/${saved.resource.id}`));
    } catch (reason) {
      setError(insightsError(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <PlatformPage title={edit ? "Edit report" : "Explore dataset"}>
      <PlatformButton
        title={stage ? "Previous step" : "Back to record"}
        secondary
        onPress={() =>
          stage
            ? setStage(stage - 1)
            : router.replace(
                insightsPath(
                  id,
                  `${edit ? "reports" : "datasets"}/${recordId}`,
                ),
              )
        }
      />
      {!dataset.result ? (
        <>
          <PlatformText>
            {report.error || dataset.error || "Loading…"}
          </PlatformText>
          <PlatformButton
            title="Retry"
            onPress={() => {
              report.retry();
              dataset.retry();
            }}
          />
        </>
      ) : (
        <>
          {stage === 0 && (
            <>
              <PlatformText>
                Choose a measure and grouping. Averages are exact fractions;
                numeric columns contain integers.
              </PlatformText>
              <PlatformButton
                title={`Measure: ${definition.metric.aggregate}`}
                onPress={() => {
                  const next =
                    definition.metric.aggregate === "count" && integers.length
                      ? "sum"
                      : definition.metric.aggregate === "sum"
                        ? "avg"
                        : "count";
                  change({
                    ...definition,
                    metric:
                      next === "count"
                        ? { aggregate: next }
                        : { aggregate: next, column: integers[0]?.name },
                  });
                }}
              />
              {definition.metric.aggregate !== "count" && (
                <PlatformButton
                  title={`Measure column: ${definition.metric.column}`}
                  onPress={() =>
                    change({
                      ...definition,
                      metric: {
                        ...definition.metric,
                        column:
                          integers[
                            (integers.findIndex(
                              (column) =>
                                column.name === definition.metric.column,
                            ) +
                              1) %
                              integers.length
                          ]?.name,
                      },
                    })
                  }
                />
              )}
              <PlatformButton
                title={`Group: ${definition.group_by ?? "all rows"}`}
                onPress={() => {
                  const index = columns.findIndex(
                    (column) => column.name === definition.group_by,
                  );
                  const next = columns[index + 1]?.name;
                  change({ ...definition, group_by: next });
                }}
              />
              <PlatformField
                label="Maximum groups (1–50)"
                value={String(definition.limit ?? 50)}
                onChangeText={(text) => {
                  if (/^\d{0,2}$/.test(text))
                    change({ ...definition, limit: Number(text) });
                }}
              />
              <PlatformButton
                title="Choose filters"
                onPress={() => setStage(1)}
              />
            </>
          )}
          {stage === 1 && (
            <>
              <PlatformText>
                {(definition.filters ?? [])
                  .map(
                    (item) => `${item.column} ${item.operator} ${item.value}`,
                  )
                  .join("; ") || "No filters"}
              </PlatformText>
              <PlatformButton
                title={`Column: ${filter?.name}`}
                onPress={() =>
                  setFilterIndex((filterIndex + 1) % columns.length)
                }
              />
              <PlatformButton
                title={`Comparison: ${filter?.type === "integer" ? operator : "eq"}`}
                disabled={filter?.type !== "integer"}
                onPress={() =>
                  setOperator(
                    operator === "eq"
                      ? "gte"
                      : operator === "gte"
                        ? "lte"
                        : "eq",
                  )
                }
              />
              <PlatformField
                label="Filter value"
                value={value}
                onChangeText={setValue}
              />
              <PlatformButton
                title="Add filter"
                disabled={!filter || (definition.filters?.length ?? 0) >= 5}
                onPress={addFilter}
              />
              <PlatformButton
                title="Clear filters"
                secondary
                onPress={() => change({ ...definition, filters: [] })}
              />
              <PlatformButton
                title="Review query"
                onPress={() => setStage(2)}
              />
            </>
          )}
          {stage === 2 && (
            <>
              <PlatformText>
                {definition.metric.aggregate}{" "}
                {definition.metric.column ?? "rows"} · group{" "}
                {definition.group_by ?? "all"} ·{" "}
                {definition.filters?.length ?? 0} filters
              </PlatformText>
              <PlatformButton
                title="Run query"
                disabled={busy}
                onPress={() => void run()}
              />
              {result && <QueryOutput result={result} />}
              <PlatformButton title="Save report" onPress={() => setStage(3)} />
            </>
          )}
          {stage === 3 && (
            <>
              <PlatformField
                label="Report name"
                value={name ?? report.result?.resource.name ?? ""}
                onChangeText={setName}
              />
              <PlatformButton
                title={`Visibility: ${visibility ?? report.result?.resource.visibility ?? "private"}`}
                onPress={() =>
                  setVisibility(
                    (visibility ??
                      report.result?.resource.visibility ??
                      "private") === "private"
                      ? "organization"
                      : "private",
                  )
                }
              />
              {edit && (
                <PlatformButton
                  title={`Status: ${status ?? report.result?.resource.status}`}
                  onPress={() =>
                    setStatus(
                      (status ?? report.result?.resource.status) === "active"
                        ? "disabled"
                        : "active",
                    )
                  }
                />
              )}
              <PlatformButton
                title="Save"
                disabled={busy}
                onPress={() => void save()}
              />
            </>
          )}
          <PlatformText>{error}</PlatformText>
        </>
      )}
    </PlatformPage>
  );
}
