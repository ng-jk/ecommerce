import { expect, it, vi } from "vitest";
import { createHrClient } from "../../packages/api-client/services/hr";

const employee = { id: 3, code: "staff-one", display_name: "Maya", linked_platform_user_id: 8,
  timezone: "Asia/Kuala_Lumpur", status: "active", version: 0 };
const attendance = { id: 4, employee_id: 3, started_at: "2026-10-13T01:00:00Z", ended_at: "2026-10-13T02:00:00Z",
  local_date: "2026-10-13", timezone: "Asia/Kuala_Lumpur", version: 0 };
const leaveType = { id: 5, code: "annual", name: "Annual", allowance_days: 10, status: "active" };
const leave = { id: 6, employee_id: 3, leave_type_id: 5, start_date: "2026-11-01", end_date: "2026-11-02",
  calendar_days: 2, status: "pending", version: 0 };
const meta = { current_page: 1, last_page: 1, total: 1, per_page: 20, options: { status: { active: "Active" } } };

it("binds all seventeen HR operations to organization paths and validates mutation bodies", async () => {
  const request = vi.fn(async (_path, schema, _method, _body) => schema.parse(
    _path.includes("leave-types") ? (!_method && _path.includes("?") ? { data: [leaveType], meta } : { leave_type: leaveType, options: meta.options.status })
      : _path.includes("/leave") ? (!_method && _path.includes("?") ? { data: [leave], meta } : { leave, options: meta.options.status })
        : _path.includes("attendance") ? (!_method && _path.includes("?") ? { data: [attendance], meta }
          : _path.includes("correct") ? { attendance, correction: { id: 7, attendance_id: 4, corrected_by_platform_user_id: 2,
            old_started_at: attendance.started_at, old_ended_at: attendance.ended_at, new_started_at: attendance.started_at,
            new_ended_at: attendance.ended_at, reason: "Correction" } } : { attendance })
          : !_method && _path.includes("?") ? { data: [employee], meta } : { employee, options: meta.options.status }));
  const hr = createHrClient(request);
  await hr.employees(2, 2, "active");
  await hr.createEmployee(2, { code: "staff-one", display_name: "Maya", timezone: "UTC", linked_platform_user_id: 8 });
  await hr.ownerEmployee(2, 3); await hr.myEmployee(2);
  await hr.updateEmployee(2, 3, { display_name: "Maya", timezone: "UTC", status: "active", expected_version: 0 });
  await hr.myAttendance(2, 2, "2026-10-13");
  await hr.recordAttendance(2, { started_at: attendance.started_at, ended_at: attendance.ended_at });
  await hr.ownerAttendance(2, 3, 2, "2026-10-13");
  await hr.correctAttendance(2, 4, { started_at: attendance.started_at, ended_at: attendance.ended_at,
    reason: "Correction", expected_version: 0 });
  await hr.leaveTypes(2, 2, "active");
  await hr.createLeaveType(2, { code: "annual", name: "Annual", allowance_days: 10 });
  await hr.myLeave(2, 2, "pending");
  await hr.requestLeave(2, { leave_type_id: 5, start_date: "2026-11-01", end_date: "2026-11-02" });
  await hr.myLeaveDetail(2, 6);
  await hr.ownerLeave(2, 2, "pending", 3); await hr.ownerLeaveDetail(2, 6);
  await hr.ownerLeave(2);
  await hr.decideLeave(2, 6, { decision: "approved", expected_version: 0 });
  expect(request).toHaveBeenCalledTimes(18);
  expect(request).toHaveBeenCalledWith("organizations/2/hr/owner/leave?page=2&per_page=3&status=pending&employee_id=3", expect.anything());
  expect(request).toHaveBeenCalledWith("organizations/2/hr/attendance/4/correct", expect.anything(), "POST",
    { started_at: attendance.started_at, ended_at: attendance.ended_at, reason: "Correction", expected_version: 0 });
  expect(() => hr.employees(0)).toThrow();
  expect(() => hr.ownerEmployee(2, 0)).toThrow();
  expect(() => hr.createEmployee(2, { code: "Bad Code", display_name: "Maya", timezone: "UTC", linked_platform_user_id: 8 })).toThrow();
  expect(() => hr.updateEmployee(2, 3, { display_name: "Maya", timezone: "UTC", status: "active", expected_version: -1 })).toThrow();
  expect(() => hr.recordAttendance(2, { started_at: "2026-10-13", ended_at: attendance.ended_at })).toThrow();
  expect(() => hr.ownerLeave(2, 1, "", 0)).toThrow();
});
