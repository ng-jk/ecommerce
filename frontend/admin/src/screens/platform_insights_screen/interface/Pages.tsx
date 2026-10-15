import {
  type InsightsKind,
  type InsightQueryResult,
} from "@portfolio/api-client";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
  usePlatformSession,
} from "../../platform_shell_screen";
import { usePlatformQuery } from "../../platform_workspace_screen";
import { insightsError, insightsPath } from "../logic/model";

export function InsightsHub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <PlatformPage title="Insights">
      <PlatformButton
        title="Organization"
        secondary
        onPress={() => router.replace(`/platform/organizations/${id}`)}
      />
      <PlatformText>
        Explore your organization’s manual datasets, reports and dashboards.
        Access is checked again each time a report runs.
      </PlatformText>
      {(["datasets", "reports", "dashboards"] as const).map((kind) => (
        <PlatformButton
          key={kind}
          title={kind}
          onPress={() => router.push(insightsPath(id, kind))}
        />
      ))}
    </PlatformPage>
  );
}
export function InsightsDirectory({ kind }: { kind: InsightsKind }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, user } = usePlatformSession();
  const [page, setPage] = useState(1);
  const query = usePlatformQuery(
    !!user,
    useCallback(
      () => api.insights.list(id, kind, page, 3),
      [api, id, kind, page],
    ),
  );
  return (
    <PlatformPage title={kind}>
      <PlatformButton
        title="Insights"
        secondary
        onPress={() => router.replace(insightsPath(id))}
      />
      {!user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : query.result ? (
        <>
          {kind !== "reports" && (
            <PlatformButton
              title={`Create ${kind === "datasets" ? "dataset" : "dashboard"}`}
              onPress={() => router.push(insightsPath(id, `${kind}/create`))}
            />
          )}
          {kind === "reports" && (
            <PlatformText>
              Open a dataset to build and save a report.
            </PlatformText>
          )}
          {!query.result.data.length && (
            <PlatformText>No records on this page.</PlatformText>
          )}
          {query.result.data.map((record) => (
            <PlatformButton
              key={record.id}
              title={`${record.name} · ${record.status} · ${record.visibility}`}
              onPress={() =>
                router.push(insightsPath(id, `${kind}/${record.id}`))
              }
            />
          ))}
          <PlatformText>
            Page {page} of {query.result.meta.last_page}
          </PlatformText>
          <PlatformButton
            title="Previous"
            secondary
            disabled={page === 1}
            onPress={() => setPage(page - 1)}
          />
          <PlatformButton
            title="Next"
            secondary
            disabled={page >= query.result.meta.last_page}
            onPress={() => setPage(page + 1)}
          />
        </>
      ) : query.error ? (
        <>
          <PlatformText>{query.error}</PlatformText>
          <PlatformButton title="Retry" onPress={query.retry} />
        </>
      ) : (
        <PlatformText>Loading…</PlatformText>
      )}
    </PlatformPage>
  );
}
export function QueryOutput({ result }: { result: InsightQueryResult }) {
  return (
    <>
      <PlatformText>
        Dataset version {result.freshness.dataset_version} · Imported{" "}
        {result.freshness.imported_at ?? "not yet"} · {result.meta.rows_scanned}{" "}
        rows scanned
      </PlatformText>
      {result.data.map((row, index) => (
        <PlatformText key={index}>
          {row.group === null ? "All rows" : String(row.group)}:{" "}
          {typeof row.value === "number"
            ? row.value
            : `${row.value.numerator} / ${row.value.denominator}`}
        </PlatformText>
      ))}
      {!result.data.length && <PlatformText>No matching rows.</PlatformText>}
      {result.meta.truncated && (
        <PlatformText>Showing a bounded subset of groups.</PlatformText>
      )}
    </>
  );
}
export function InsightsRecord({ kind }: { kind: InsightsKind }) {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const { api, user } = usePlatformSession();
  const query = usePlatformQuery(
    !!user,
    useCallback(
      () => api.insights.detail(id, kind, recordId),
      [api, id, kind, recordId],
    ),
  );
  const [results, setResults] = useState<InsightQueryResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async () => {
    setBusy(true);
    setError("");
    setResults([]);
    try {
      setResults(
        kind === "reports"
          ? [await api.insights.runReport(id, recordId)]
          : (await api.insights.renderDashboard(id, recordId)).reports,
      );
    } catch (reason) {
      setError(insightsError(reason));
    } finally {
      setBusy(false);
    }
  };
  const toggleDashboard = async () => {
    const record = query.result!.resource;
    setBusy(true);
    setError("");
    try {
      await api.insights.updateDashboard(id, recordId, {
        name: record.name,
        visibility: record.visibility,
        report_ids: record.report_ids!,
        expected_version: record.version,
        status: record.status === "active" ? "disabled" : "active",
      });
      setResults([]);
      query.retry();
    } catch (reason) {
      setError(insightsError(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <PlatformPage title={query.result?.resource.name ?? "Insights record"}>
      <PlatformButton
        title={kind}
        secondary
        onPress={() => router.replace(insightsPath(id, kind))}
      />
      {query.result ? (
        <>
          <PlatformText>
            {query.result.resource.status} · {query.result.resource.visibility}{" "}
            · version {query.result.resource.version}
          </PlatformText>
          <PlatformButton
            title="Edit"
            onPress={() =>
              router.push(insightsPath(id, `${kind}/${recordId}/edit`))
            }
          />
          {kind === "dashboards" && (
            <PlatformButton
              title={
                query.result.resource.status === "active"
                  ? "Disable dashboard"
                  : "Enable dashboard"
              }
              disabled={busy || !query.result.resource.report_ids}
              onPress={() => void toggleDashboard()}
            />
          )}
          {kind === "datasets" ? (
            <>
              <PlatformText>
                {query.result.resource.schema
                  ?.map((column) => `${column.name}: ${column.type}`)
                  .join(" · ")}
              </PlatformText>
              <PlatformButton
                title="Replace dataset rows"
                onPress={() =>
                  router.push(insightsPath(id, `datasets/${recordId}/import`))
                }
              />
              <PlatformButton
                title="Explore and save report"
                onPress={() =>
                  router.push(insightsPath(id, `datasets/${recordId}/query`))
                }
              />
            </>
          ) : (
            <PlatformButton
              title={busy ? "Running…" : "Run with current data"}
              disabled={busy}
              onPress={() => void run()}
            />
          )}
          {error && <PlatformText>{error}</PlatformText>}
          {results.map((result, index) => (
            <QueryOutput key={index} result={result} />
          ))}
        </>
      ) : query.error ? (
        <>
          <PlatformText>{query.error}</PlatformText>
          <PlatformButton title="Retry" onPress={query.retry} />
        </>
      ) : (
        <PlatformText>Loading…</PlatformText>
      )}
    </PlatformPage>
  );
}
