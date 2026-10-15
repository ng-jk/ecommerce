import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
  usePlatformSession,
} from "../../platform_shell_screen";
import { usePlatformQuery } from "../../platform_workspace_screen";
import { hrBase, hrPath } from "../logic/model";

export type HrDirectoryKind =
  | "employees"
  | "attendance"
  | "employee-attendance"
  | "leave-types"
  | "leave"
  | "owner-leave";
type Row = {
  id: number;
  display_name?: string;
  name?: string;
  employee_id?: number;
  start_date?: string;
  local_date?: string;
  status?: string;
  version?: number;
  started_at?: string;
  ended_at?: string;
};
type Page = {
  data: Row[];
  meta: { last_page: number; options: { status: Record<string, string> } };
};

export function HrDirectory({ kind }: { kind: HrDirectoryKind }) {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const { api, user } = usePlatformSession();
  const [page, setPage] = useState(1);
  const load = useCallback(async (): Promise<Page> => {
    switch (kind) {
      case "employees":
        return api.hr.employees(id, page);
      case "attendance":
        return api.hr.myAttendance(id, page);
      case "employee-attendance":
        return api.hr.ownerAttendance(id, recordId, page);
      case "leave-types":
        return api.hr.leaveTypes(id, page);
      case "leave":
        return api.hr.myLeave(id, page);
      case "owner-leave":
        return api.hr.ownerLeave(id, page);
    }
  }, [api, id, kind, page, recordId]);
  const query = usePlatformQuery(!!user, load);
  const title = {
    employees: "Employees",
    attendance: "My attendance",
    "employee-attendance": "Employee attendance",
    "leave-types": "Leave types",
    leave: "My leave",
    "owner-leave": "Approve leave",
  }[kind];
  const destination = (row: Row) =>
    kind === "employees"
      ? `employees/${row.id}`
      : kind === "employee-attendance"
        ? `attendance/${row.id}/correct?employee_id=${recordId}&version=${row.version}&started_at=${encodeURIComponent(row.started_at ?? "")}&ended_at=${encodeURIComponent(row.ended_at ?? "")}`
        : kind === "leave"
          ? `leave/${row.id}`
          : `owner/leave/${row.id}`;
  const back = kind === "employee-attendance" ? `employees/${recordId}` : "";
  return (
    <PlatformPage title={title}>
      <PlatformButton
        title={back ? "Employee" : "HR"}
        secondary
        onPress={() => router.replace(back ? hrPath(id, back) : hrBase(id))}
      />
      {!user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : query.result ? (
        <>
          {kind === "employees" && (
            <PlatformButton
              title="Add employee"
              onPress={() => router.push(hrPath(id, "employees/create"))}
            />
          )}
          {kind === "attendance" && (
            <PlatformButton
              title="Record attendance"
              onPress={() => router.push(hrPath(id, "attendance/record"))}
            />
          )}
          {kind === "leave-types" && (
            <PlatformButton
              title="Add leave type"
              onPress={() => router.push(hrPath(id, "leave-types/create"))}
            />
          )}
          {kind === "leave" && (
            <PlatformButton
              title="Request leave"
              onPress={() => router.push(hrPath(id, "leave/create"))}
            />
          )}
          {query.result.data.length === 0 && (
            <PlatformText>No records on this page.</PlatformText>
          )}
          {query.result.data.map((row) => {
            const label = `${row.display_name ?? row.name ?? row.local_date ?? row.start_date ?? `Record ${row.id}`} · ${query.result!.meta.options.status[row.status ?? ""] ?? row.status ?? ""}`;
            return kind === "leave-types" || kind === "attendance" ? (
              <PlatformText key={row.id}>{label}</PlatformText>
            ) : (
              <PlatformButton
                key={row.id}
                title={label}
                onPress={() => router.push(hrPath(id, destination(row)))}
              />
            );
          })}
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
        <PlatformText>Loading {title}…</PlatformText>
      )}
    </PlatformPage>
  );
}
