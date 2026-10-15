import { errorMessage } from "@portfolio/api-client";
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

export function HrEmployeeRecord({ mine = false }: { mine?: boolean }) {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const { api, user } = usePlatformSession();
  const query = usePlatformQuery(
    !!user,
    useCallback(
      () => (mine ? api.hr.myEmployee(id) : api.hr.ownerEmployee(id, recordId)),
      [api, id, mine, recordId],
    ),
  );
  const employee = query.result?.employee;
  return (
    <PlatformPage title={mine ? "My employee profile" : "Employee"}>
      <PlatformButton
        title={mine ? "HR" : "Employees"}
        secondary
        onPress={() =>
          router.replace(mine ? hrBase(id) : hrPath(id, "employees"))
        }
      />
      {!user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : employee ? (
        <>
          <PlatformText>
            {employee.display_name} · {employee.code}
          </PlatformText>
          <PlatformText>
            {query.result?.options[employee.status] ?? employee.status} ·{" "}
            {employee.timezone}
          </PlatformText>
          {!mine && (
            <PlatformButton
              title="Edit employee"
              onPress={() =>
                router.push(hrPath(id, `employees/${employee.id}/edit`))
              }
            />
          )}
          {!mine && (
            <PlatformButton
              title="Attendance"
              onPress={() =>
                router.push(hrPath(id, `employees/${employee.id}/attendance`))
              }
            />
          )}
        </>
      ) : query.error ? (
        <>
          <PlatformText>{query.error}</PlatformText>
          <PlatformButton title="Retry" onPress={query.retry} />
        </>
      ) : (
        <PlatformText>Loading employee…</PlatformText>
      )}
    </PlatformPage>
  );
}

export function HrLeaveRecord({ owner = false }: { owner?: boolean }) {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const { api, user } = usePlatformSession();
  const query = usePlatformQuery(
    !!user,
    useCallback(
      () =>
        owner
          ? api.hr.ownerLeaveDetail(id, recordId)
          : api.hr.myLeaveDetail(id, recordId),
      [api, id, owner, recordId],
    ),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const leave = query.result?.leave;
  const decide = async (decision: "approved" | "rejected") => {
    if (!leave || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await api.hr.decideLeave(id, leave.id, {
        decision,
        expected_version: leave.version,
      });
      query.retry();
    } catch (reason) {
      setMessage(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <PlatformPage title={owner ? "Leave decision" : "My leave request"}>
      <PlatformButton
        title={owner ? "Owner leave" : "My leave"}
        secondary
        onPress={() =>
          router.replace(hrPath(id, owner ? "owner/leave" : "leave"))
        }
      />
      {!user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : leave ? (
        <>
          <PlatformText>
            {leave.start_date} to {leave.end_date} · {leave.calendar_days}{" "}
            calendar days
          </PlatformText>
          <PlatformText>
            {query.result?.options[leave.status] ?? leave.status}
          </PlatformText>
          {owner && leave.status === "pending" && (
            <>
              <PlatformButton
                title={query.result?.options.approved ?? "Approve"}
                disabled={busy}
                onPress={() => void decide("approved")}
              />
              <PlatformButton
                title={query.result?.options.rejected ?? "Reject"}
                disabled={busy}
                onPress={() => void decide("rejected")}
              />
            </>
          )}
          {!!message && <PlatformText>{message}</PlatformText>}
        </>
      ) : query.error ? (
        <>
          <PlatformText>{query.error}</PlatformText>
          <PlatformButton title="Retry" onPress={query.retry} />
        </>
      ) : (
        <PlatformText>Loading leave…</PlatformText>
      )}
    </PlatformPage>
  );
}
