import { type InsightResource } from "@portfolio/api-client";
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
import {
  insightsError,
  insightsPath,
  parseColumns,
  parseCsv,
} from "../logic/model";

export function DatasetForm({ edit = false }: { edit?: boolean }) {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const { api, user } = usePlatformSession();
  const query = usePlatformQuery(
    !!user && edit,
    useCallback(
      () => api.insights.detail(id, "datasets", recordId),
      [api, id, recordId],
    ),
  );
  const record = query.result?.resource;
  const [name, setName] = useState<string | null>(null);
  const [columns, setColumns] = useState("team:string\nvalue:integer");
  const [visibility, setVisibility] = useState<
    "private" | "organization" | null
  >(null);
  const [status, setStatus] = useState<"active" | "disabled" | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const common = {
        name: name ?? record?.name ?? "",
        visibility: visibility ?? record?.visibility ?? "private",
      };
      const result =
        edit && record
          ? await api.insights.updateDataset(id, record.id, {
              ...common,
              status: status ?? record.status,
              expected_version: record.version,
            })
          : await api.insights.createDataset(id, {
              ...common,
              schema: parseColumns(columns),
            });
      router.replace(insightsPath(id, `datasets/${result.resource.id}`));
    } catch (reason) {
      setError(insightsError(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <PlatformPage title={edit ? "Edit dataset" : "Create manual dataset"}>
      <PlatformButton
        title="Datasets"
        secondary
        onPress={() => router.replace(insightsPath(id, "datasets"))}
      />
      {edit && !record ? (
        <PlatformText>{query.error || "Loading…"}</PlatformText>
      ) : (
        <>
          <PlatformField
            label="Name"
            value={name ?? record?.name ?? ""}
            onChangeText={setName}
          />
          {!edit && (
            <PlatformField
              label="Columns: one name:string, name:integer or name:boolean per line"
              value={columns}
              onChangeText={setColumns}
              multiline
            />
          )}
          <PlatformButton
            title={`Visibility: ${visibility ?? record?.visibility ?? "private"}`}
            secondary
            onPress={() =>
              setVisibility(
                (visibility ?? record?.visibility ?? "private") === "private"
                  ? "organization"
                  : "private",
              )
            }
          />
          {edit && (
            <PlatformButton
              title={`Status: ${status ?? record?.status}`}
              secondary
              onPress={() =>
                setStatus(
                  (status ?? record?.status) === "active"
                    ? "disabled"
                    : "active",
                )
              }
            />
          )}
          <PlatformText>{error}</PlatformText>
          <PlatformButton
            title="Save"
            disabled={busy || !user}
            onPress={() => void save()}
          />
        </>
      )}
    </PlatformPage>
  );
}
export function DatasetImport() {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const { api, user } = usePlatformSession();
  const query = usePlatformQuery(
    !!user,
    useCallback(
      () => api.insights.detail(id, "datasets", recordId),
      [api, id, recordId],
    ),
  );
  const [csv, setCsv] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api.insights.replaceRows(id, recordId, {
        expected_version: query.result!.resource.version,
        rows: parseCsv(csv, query.result!.resource.schema!),
      });
      router.replace(insightsPath(id, `datasets/${recordId}`));
    } catch (reason) {
      setError(insightsError(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <PlatformPage title="Replace dataset rows">
      <PlatformButton
        title="Dataset"
        secondary
        onPress={() => router.replace(insightsPath(id, `datasets/${recordId}`))}
      />
      <PlatformText>
        This replaces the current imported data. Paste CSV with this exact
        header:{" "}
        {query.result?.resource.schema?.map((column) => column.name).join(",")}.
        At most 500 rows and 48 KB; integers only for numeric columns.
      </PlatformText>
      <PlatformField
        label="CSV including headers"
        value={csv}
        onChangeText={setCsv}
        multiline
      />
      <PlatformText>{error || query.error}</PlatformText>
      <PlatformButton
        title="Replace rows"
        disabled={busy || !query.result?.resource.schema}
        onPress={() => void save()}
      />
    </PlatformPage>
  );
}
export function DashboardForm({ edit = false }: { edit?: boolean }) {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const { api, user } = usePlatformSession();
  const detail = usePlatformQuery(
    !!user && edit,
    useCallback(
      () => api.insights.detail(id, "dashboards", recordId),
      [api, id, recordId],
    ),
  );
  const [stage, setStage] = useState(0);
  const [page, setPage] = useState(1);
  const reports = usePlatformQuery(
    !!user,
    useCallback(
      () => api.insights.list(id, "reports", page, 3),
      [api, id, page],
    ),
  );
  const record: InsightResource | undefined = detail.result?.resource;
  const [name, setName] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[] | null>(null);
  const ids = selected ?? record?.report_ids ?? [];
  const [visibility, setVisibility] = useState<
    "private" | "organization" | null
  >(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const input = {
        name: name ?? record?.name ?? "",
        visibility: visibility ?? record?.visibility ?? "private",
        report_ids: ids,
      };
      const result =
        edit && record
          ? await api.insights.updateDashboard(id, record.id, {
              ...input,
              expected_version: record.version,
              status: record.status,
            })
          : await api.insights.createDashboard(id, input);
      router.replace(insightsPath(id, `dashboards/${result.resource.id}`));
    } catch (reason) {
      setError(insightsError(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <PlatformPage title={edit ? "Edit dashboard" : "Create dashboard"}>
      <PlatformButton
        title="Dashboards"
        secondary
        onPress={() => router.replace(insightsPath(id, "dashboards"))}
      />
      {stage === 1 && (
        <>
          <PlatformField
            label="Name"
            value={name ?? record?.name ?? ""}
            onChangeText={setName}
          />
          <PlatformButton
            title={`Visibility: ${visibility ?? record?.visibility ?? "private"}`}
            secondary
            onPress={() =>
              setVisibility(
                (visibility ?? record?.visibility ?? "private") === "private"
                  ? "organization"
                  : "private",
              )
            }
          />
          <PlatformButton
            title="Change reports"
            secondary
            onPress={() => setStage(0)}
          />
        </>
      )}
      {stage === 0 && (
        <>
          <PlatformText>
            Select one to six reports. Dataset access still applies to every
            viewer.
          </PlatformText>
          {reports.result?.data.map((report) => (
            <PlatformButton
              key={report.id}
              title={`${ids.includes(report.id) ? "✓ " : ""}${report.name}`}
              secondary
              onPress={() =>
                setSelected(
                  ids.includes(report.id)
                    ? ids.filter((value) => value !== report.id)
                    : [...ids, report.id],
                )
              }
            />
          ))}
          <PlatformButton
            title="Previous reports"
            secondary
            disabled={page === 1}
            onPress={() => setPage(page - 1)}
          />
          <PlatformButton
            title="Next reports"
            secondary
            disabled={!reports.result || page >= reports.result.meta.last_page}
            onPress={() => setPage(page + 1)}
          />
          <PlatformButton
            title="Continue"
            disabled={!ids.length || ids.length > 6}
            onPress={() => setStage(1)}
          />
        </>
      )}
      <PlatformText>{error || reports.error || detail.error}</PlatformText>
      {stage === 1 && (
        <PlatformButton
          title="Save"
          disabled={busy || !ids.length || ids.length > 6 || (edit && !record)}
          onPress={() => void save()}
        />
      )}
    </PlatformPage>
  );
}
