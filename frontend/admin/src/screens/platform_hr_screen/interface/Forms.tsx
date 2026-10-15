import { ApiError, errorMessage } from "@portfolio/api-client";
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
import { hrPath } from "../logic/model";

function Failure({ reason }: { reason: unknown }) {
  if (!reason) return null;
  return (
    <>
      <PlatformText>{errorMessage(reason)}</PlatformText>
      {reason instanceof ApiError &&
        Object.entries(reason.validation_error).flatMap(([field, messages]) =>
          messages.map((message, index) => (
            <PlatformText key={`${field}.${index}`}>
              {field}: {message}
            </PlatformText>
          )),
        )}
    </>
  );
}

export function HrEmployeeForm({ edit = false }: { edit?: boolean }) {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const { api, user } = usePlatformSession();
  const query = usePlatformQuery(
    !!user && edit && !!recordId,
    useCallback(() => api.hr.ownerEmployee(id, recordId!), [api, id, recordId]),
  );
  const record = query.result?.employee;
  const [code, setCode] = useState("");
  const [linkedId, setLinkedId] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<unknown>(null);
  const statuses = Object.keys(query.result?.options ?? {});
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setReason(null);
    try {
      const result =
        edit && record
          ? await api.hr.updateEmployee(id, record.id, {
              display_name: name ?? record.display_name,
              timezone: timezone ?? record.timezone,
              status: status ?? record.status,
              expected_version: record.version,
            })
          : await api.hr.createEmployee(id, {
              code: code.trim().toLowerCase(),
              display_name: name ?? "",
              timezone: timezone ?? "",
              linked_platform_user_id: Number(linkedId),
            });
      router.replace(hrPath(id, `employees/${result.employee.id}`));
    } catch (error) {
      setReason(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <PlatformPage title={edit ? "Edit employee" : "Add employee"}>
      <PlatformButton
        title="Employees"
        secondary
        onPress={() => router.replace(hrPath(id, "employees"))}
      />
      {!user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : edit && !record ? (
        query.error ? (
          <>
            <PlatformText>{query.error}</PlatformText>
            <PlatformButton title="Retry" onPress={query.retry} />
          </>
        ) : (
          <PlatformText>Loading employee…</PlatformText>
        )
      ) : (
        <>
          {!edit && (
            <>
              <PlatformField
                label="Code"
                value={code}
                onChangeText={setCode}
                autoCapitalize="none"
              />
              <PlatformField
                label="Active member account ID"
                value={linkedId}
                onChangeText={setLinkedId}
                keyboardType="number-pad"
              />
            </>
          )}
          <PlatformField
            label="Display name"
            value={name ?? record?.display_name ?? ""}
            onChangeText={setName}
          />
          <PlatformField
            label="IANA timezone"
            value={timezone ?? record?.timezone ?? ""}
            onChangeText={setTimezone}
            autoCapitalize="none"
          />
          {edit && (
            <PlatformButton
              title={`Status: ${query.result!.options[status ?? record!.status] ?? "Choose"}`}
              secondary
              onPress={() =>
                setStatus(
                  (current) =>
                    statuses[
                      (statuses.indexOf(current ?? record!.status) + 1) %
                        statuses.length
                    ] ?? null,
                )
              }
            />
          )}
          <Failure reason={reason} />
          <PlatformButton
            title="Save employee"
            disabled={busy}
            onPress={() => void save()}
          />
        </>
      )}
    </PlatformPage>
  );
}

export function HrAttendanceForm({ correct = false }: { correct?: boolean }) {
  const { id, recordId, employee_id, version, started_at, ended_at } =
    useLocalSearchParams<{
      id: string;
      recordId: string;
      employee_id?: string;
      version?: string;
      started_at?: string;
      ended_at?: string;
    }>();
  const { api, user } = usePlatformSession();
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const back =
    correct && employee_id
      ? `employees/${employee_id}/attendance`
      : "attendance";
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      if (correct)
        await api.hr.correctAttendance(id, recordId, {
          started_at: start ?? started_at ?? "",
          ended_at: end ?? ended_at ?? "",
          reason,
          expected_version: Number(version),
        });
      else
        await api.hr.recordAttendance(id, {
          started_at: start ?? "",
          ended_at: end ?? "",
        });
      router.replace(hrPath(id, back));
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <PlatformPage title={correct ? "Correct attendance" : "Record attendance"}>
      <PlatformButton
        title="Attendance"
        secondary
        onPress={() => router.replace(hrPath(id, back))}
      />
      {!user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : (
        <>
          <PlatformText>
            Use ISO 8601 timestamps with UTC offsets. An interval is not proof
            of work.
          </PlatformText>
          <PlatformField
            label="Start with offset"
            value={start ?? started_at ?? ""}
            onChangeText={setStart}
            autoCapitalize="none"
          />
          <PlatformField
            label="End with offset"
            value={end ?? ended_at ?? ""}
            onChangeText={setEnd}
            autoCapitalize="none"
          />
          {correct && (
            <PlatformField
              label="Correction reason"
              value={reason}
              onChangeText={setReason}
            />
          )}
          <Failure reason={failure} />
          <PlatformButton
            title={correct ? "Save correction" : "Record interval"}
            disabled={busy || (correct && !version)}
            onPress={() => void save()}
          />
        </>
      )}
    </PlatformPage>
  );
}

export function HrLeaveTypeForm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, user } = usePlatformSession();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<unknown>(null);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setReason(null);
    try {
      await api.hr.createLeaveType(id, {
        code: code.trim().toLowerCase(),
        name,
        allowance_days: Number(days),
      });
      router.replace(hrPath(id, "leave-types"));
    } catch (error) {
      setReason(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <PlatformPage title="Add leave type">
      <PlatformButton
        title="Leave types"
        secondary
        onPress={() => router.replace(hrPath(id, "leave-types"))}
      />
      {!user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : (
        <>
          <PlatformField
            label="Code"
            value={code}
            onChangeText={setCode}
            autoCapitalize="none"
          />
          <PlatformField label="Name" value={name} onChangeText={setName} />
          <PlatformField
            label="Annual calendar-day allowance"
            value={days}
            onChangeText={setDays}
            keyboardType="number-pad"
          />
          <Failure reason={reason} />
          <PlatformButton
            title="Save leave type"
            disabled={busy}
            onPress={() => void save()}
          />
        </>
      )}
    </PlatformPage>
  );
}

export function HrLeaveForm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, user } = usePlatformSession();
  const [page, setPage] = useState(1);
  const types = usePlatformQuery(
    !!user,
    useCallback(() => api.hr.leaveTypes(id, page, "active"), [api, id, page]),
  );
  const [typeId, setTypeId] = useState<number | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<unknown>(null);
  const active =
    types.result?.data.filter((type) => type.status === "active") ?? [];
  const chosen = typeId ?? active[0]?.id;
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setReason(null);
    try {
      const result = await api.hr.requestLeave(id, {
        leave_type_id: chosen!,
        start_date: start,
        end_date: end,
      });
      router.replace(hrPath(id, `leave/${result.leave.id}`));
    } catch (error) {
      setReason(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <PlatformPage title="Request leave">
      <PlatformButton
        title="My leave"
        secondary
        onPress={() => router.replace(hrPath(id, "leave"))}
      />
      {!user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : types.result ? (
        <>
          {active.length === 0 ? (
            <PlatformText>No active leave types.</PlatformText>
          ) : (
            <>
              <PlatformButton
                title={`Type: ${active.find((type) => type.id === chosen)!.name}`}
                secondary
                onPress={() =>
                  setTypeId(
                    active[
                      (active.findIndex((type) => type.id === chosen) + 1) %
                        active.length
                    ]!.id,
                  )
                }
              />
              <PlatformText>
                Available allowance:{" "}
                {active.find((type) => type.id === chosen)!.allowance_days}{" "}
                calendar days per year
              </PlatformText>
            </>
          )}
          <PlatformText>
            Leave type page {page} of {types.result.meta.last_page}
          </PlatformText>
          <PlatformButton
            title="Previous types"
            secondary
            disabled={page === 1}
            onPress={() => {
              setTypeId(null);
              setPage(page - 1);
            }}
          />
          <PlatformButton
            title="Next types"
            secondary
            disabled={page >= types.result.meta.last_page}
            onPress={() => {
              setTypeId(null);
              setPage(page + 1);
            }}
          />
          <PlatformField
            label="Start date YYYY-MM-DD"
            value={start}
            onChangeText={setStart}
          />
          <PlatformField
            label="End date YYYY-MM-DD"
            value={end}
            onChangeText={setEnd}
          />
          <Failure reason={reason} />
          <PlatformButton
            title="Submit request"
            disabled={busy || active.length === 0}
            onPress={() => void save()}
          />
        </>
      ) : types.error ? (
        <>
          <PlatformText>{types.error}</PlatformText>
          <PlatformButton title="Retry" onPress={types.retry} />
        </>
      ) : (
        <PlatformText>Loading leave types…</PlatformText>
      )}
    </PlatformPage>
  );
}
