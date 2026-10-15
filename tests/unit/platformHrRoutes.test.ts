// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.mock("../../frontend/admin/src/screens/platform_hr_screen", () => ({
  HrHub: () => createElement("span", {}, "hub"),
  HrDirectory: ({ kind }: { kind: string }) => createElement("span", {}, `directory:${kind}`),
  HrEmployeeRecord: ({ mine }: { mine?: boolean }) => createElement("span", {}, mine ? "employee:mine" : "employee:owner"),
  HrLeaveRecord: ({ owner }: { owner?: boolean }) => createElement("span", {}, owner ? "leave:owner" : "leave:mine"),
  HrEmployeeForm: ({ edit }: { edit?: boolean }) => createElement("span", {}, edit ? "employee:edit" : "employee:create"),
  HrAttendanceForm: ({ correct }: { correct?: boolean }) => createElement("span", {}, correct ? "attendance:correct" : "attendance:record"),
  HrLeaveTypeForm: () => createElement("span", {}, "type:create"),
  HrLeaveForm: () => createElement("span", {}, "leave:create"),
}));

import Hub from "../../frontend/admin/src/app/platform/organizations/[id]/hr";
import Mine from "../../frontend/admin/src/app/platform/organizations/[id]/hr/me";
import Employees from "../../frontend/admin/src/app/platform/organizations/[id]/hr/employees";
import CreateEmployee from "../../frontend/admin/src/app/platform/organizations/[id]/hr/employees/create";
import Employee from "../../frontend/admin/src/app/platform/organizations/[id]/hr/employees/[recordId]";
import EditEmployee from "../../frontend/admin/src/app/platform/organizations/[id]/hr/employees/[recordId]/edit";
import EmployeeAttendance from "../../frontend/admin/src/app/platform/organizations/[id]/hr/employees/[recordId]/attendance";
import Attendance from "../../frontend/admin/src/app/platform/organizations/[id]/hr/attendance";
import RecordAttendance from "../../frontend/admin/src/app/platform/organizations/[id]/hr/attendance/record";
import CorrectAttendance from "../../frontend/admin/src/app/platform/organizations/[id]/hr/attendance/[recordId]/correct";
import LeaveTypes from "../../frontend/admin/src/app/platform/organizations/[id]/hr/leave-types";
import CreateLeaveType from "../../frontend/admin/src/app/platform/organizations/[id]/hr/leave-types/create";
import Leave from "../../frontend/admin/src/app/platform/organizations/[id]/hr/leave";
import RequestLeave from "../../frontend/admin/src/app/platform/organizations/[id]/hr/leave/create";
import LeaveRecord from "../../frontend/admin/src/app/platform/organizations/[id]/hr/leave/[recordId]";
import OwnerLeave from "../../frontend/admin/src/app/platform/organizations/[id]/hr/owner/leave";
import OwnerLeaveRecord from "../../frontend/admin/src/app/platform/organizations/[id]/hr/owner/leave/[recordId]";

it.each([
  [Hub, "hub"], [Mine, "employee:mine"], [Employees, "directory:employees"],
  [CreateEmployee, "employee:create"], [Employee, "employee:owner"], [EditEmployee, "employee:edit"],
  [EmployeeAttendance, "directory:employee-attendance"], [Attendance, "directory:attendance"],
  [RecordAttendance, "attendance:record"], [CorrectAttendance, "attendance:correct"],
  [LeaveTypes, "directory:leave-types"], [CreateLeaveType, "type:create"],
  [Leave, "directory:leave"], [RequestLeave, "leave:create"], [LeaveRecord, "leave:mine"],
  [OwnerLeave, "directory:owner-leave"], [OwnerLeaveRecord, "leave:owner"],
] as const)("wires each HR page to its intended screen: %s", async (Page, expected) => {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(createElement(Page)));
  expect(container.textContent).toBe(expected);
  await act(async () => root.unmount());
});
