// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "../../packages/api-client";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const routing = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), params: {
  id: "2", recordId: "3", employee_id: "3", version: "0", started_at: "2026-10-13T01:00:00Z", ended_at: "2026-10-13T02:00:00Z",
} }));
const buttons = vi.hoisted(() => ({ ignoreDisabled: false }));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return { router: routing, useLocalSearchParams: () => routing.params,
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]) };
});
vi.mock("react-native", () => ({ View: ({ children }: { children: ReactNode }) => createElement("div", {}, children) }));

const employee = { id: 3, code: "staff-one", display_name: "Maya", linked_platform_user_id: 8,
  timezone: "Asia/Kuala_Lumpur", status: "active", version: 0 };
const attendance: { id: number; employee_id: number; started_at: string | undefined; ended_at: string | undefined;
  local_date: string; timezone: string; version: number } = { id: 4, employee_id: 3, started_at: routing.params.started_at, ended_at: routing.params.ended_at,
  local_date: "2026-10-13", timezone: "Asia/Kuala_Lumpur", version: 0 };
const leaveType = { id: 5, code: "annual", name: "Annual", allowance_days: 10, status: "active" };
const leave = { id: 3, employee_id: 3, leave_type_id: 5, start_date: "2026-11-01", end_date: "2026-11-02",
  calendar_days: 2, status: "pending", version: 0 };
const meta: { current_page: number; last_page: number; total: number; per_page: number;
  options: { status: Record<string, string> } } = { current_page: 1, last_page: 2, total: 4, per_page: 3,
  options: { status: { active: "Active", inactive: "Inactive", terminated: "Terminated", pending: "Pending", approved: "Approved", rejected: "Rejected" } } };
const hr = {
  employees: vi.fn(async () => ({ data: [employee], meta })), createEmployee: vi.fn(async () => ({ employee })),
  ownerEmployee: vi.fn(async () => ({ employee, options: meta.options.status })),
  myEmployee: vi.fn(async () => ({ employee, options: meta.options.status })),
  updateEmployee: vi.fn(async () => ({ employee: { ...employee, version: 1 }, options: meta.options.status })),
  myAttendance: vi.fn(async () => ({ data: [attendance], meta })),
  recordAttendance: vi.fn(async () => ({ attendance })),
  ownerAttendance: vi.fn(async () => ({ data: [attendance], meta })),
  correctAttendance: vi.fn(async () => ({ attendance: { ...attendance, version: 1 } })),
  leaveTypes: vi.fn(async () => ({ data: [leaveType], meta })),
  createLeaveType: vi.fn(async () => ({ leave_type: leaveType, options: meta.options.status })),
  myLeave: vi.fn(async () => ({ data: [leave], meta })), requestLeave: vi.fn(async () => ({ leave })),
  myLeaveDetail: vi.fn(async () => ({ leave, options: meta.options.status })),
  ownerLeave: vi.fn(async (): Promise<{ data: Array<Partial<typeof leave>>; meta: typeof meta }> => ({ data: [leave], meta })),
  ownerLeaveDetail: vi.fn(async () => ({ leave, options: meta.options.status })),
  decideLeave: vi.fn(async () => ({ leave: { ...leave, status: "approved", version: 1 }, options: meta.options.status })),
};
const workspace = { organization: vi.fn(async () => ({ can_update: true })) };
const session = { api: { hr, workspace }, user: { id: 8 } as { id: number } | null };
vi.mock("../../frontend/admin/src/screens/platform_shell_screen", () => ({
  usePlatformSession: () => session,
  PlatformPage: ({ title, children }: { title: string; children: ReactNode }) => createElement("main", {}, createElement("h1", {}, title), children),
  PlatformText: ({ children }: { children: ReactNode }) => createElement("p", {}, children),
  PlatformButton: ({ title, onPress, disabled }: { title: string; onPress(): void; disabled?: boolean }) =>
    createElement("button", { onClick: onPress, disabled: buttons.ignoreDisabled ? false : disabled }, title),
  PlatformField: ({ label, value, onChangeText }: { label: string; value: string; onChangeText(value: string): void }) =>
    createElement("input", { "aria-label": label, value, onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChangeText(event.currentTarget.value) }),
}));

import { HrHub, HrDirectory, HrEmployeeRecord, HrLeaveRecord, HrEmployeeForm,
  HrAttendanceForm, HrLeaveTypeForm, HrLeaveForm } from "../../frontend/admin/src/screens/platform_hr_screen";
import { hrBase, hrPath } from "../../frontend/admin/src/screens/platform_hr_screen/logic/model";

beforeEach(() => {
  vi.clearAllMocks();
  routing.params.started_at = "2026-10-13T01:00:00Z";
  routing.params.ended_at = "2026-10-13T02:00:00Z";
  buttons.ignoreDisabled = false;
  session.user = { id: 8 };
  workspace.organization.mockResolvedValue({ can_update: true });
  hr.ownerEmployee.mockResolvedValue({ employee, options: meta.options.status });
  hr.myEmployee.mockResolvedValue({ employee, options: meta.options.status });
  hr.ownerLeaveDetail.mockResolvedValue({ leave, options: meta.options.status });
  hr.myLeaveDetail.mockResolvedValue({ leave, options: meta.options.status });
  hr.leaveTypes.mockResolvedValue({ data: [leaveType], meta });
});

async function render(element: React.ReactElement) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => { root.render(element); });
  return {
    container,
    button(label: string) { return [...container.querySelectorAll("button")].find(item => item.textContent?.includes(label))!; },
    async press(label: string) { await act(async () => { this.button(label).click(); }); },
    async fill(label: string, value: string) {
      const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    },
    async close() { await act(async () => root.unmount()); },
  };
}

function deferred<T>() {
  let release!: (value: T) => void;
  const promise = new Promise<T>(resolve => { release = resolve; });
  return { promise, release };
}

it("shows current HR hub destinations and owner controls", async () => {
  expect(hrBase("2")).toBe("/platform/organizations/2/hr");
  const view = await render(createElement(HrHub));
  for (const label of ["My profile", "My attendance", "My leave", "Leave types", "Employees", "Approve leave"])
    await view.press(label);
  expect(routing.push).toHaveBeenCalledWith(hrPath("2", "owner/leave"));
  await view.press("Services");
  expect(routing.replace).toHaveBeenCalledWith("/platform/organizations/2/service-hub");
  await view.close();
  workspace.organization.mockResolvedValueOnce({ can_update: false });
  const member = await render(createElement(HrHub));
  expect(member.container.textContent).not.toContain("Approve leave");
  await member.close();
});

it("paginates owner and self directories with bound row navigation", async () => {
  for (const kind of ["employees", "attendance", "employee-attendance", "leave-types", "leave", "owner-leave"] as const) {
    const view = await render(createElement(HrDirectory, { kind }));
    expect(view.container.textContent).toContain("Page 1 of 2");
    await view.press("Next");
    await view.press("Previous");
    if (kind === "employees") { await view.press("Add employee"); await view.press("Maya"); }
    if (kind === "attendance") await view.press("Record attendance");
    if (kind === "employee-attendance") await view.press("2026-10-13");
    if (kind === "leave-types") await view.press("Add leave type");
    if (kind === "leave") { await view.press("Request leave"); await view.press("2026-11-01"); }
    if (kind === "owner-leave") await view.press("2026-11-01");
    await view.close();
  }
  expect(routing.push).toHaveBeenCalledWith(hrPath("2", "employees/3"));
  expect(routing.push).toHaveBeenCalledWith(hrPath("2", "attendance/4/correct?employee_id=3&version=0&started_at=2026-10-13T01%3A00%3A00Z&ended_at=2026-10-13T02%3A00%3A00Z"));
  expect(hr.ownerAttendance).toHaveBeenCalledWith("2", "3", 1);
});

it("renders scoped profile and versioned leave decisions", async () => {
  const own = await render(createElement(HrEmployeeRecord, { mine: true }));
  expect(own.container.textContent).toContain("Maya");
  await own.close();
  const owner = await render(createElement(HrEmployeeRecord));
  await owner.press("Edit employee"); await owner.press("Attendance"); await owner.close();
  const myLeave = await render(createElement(HrLeaveRecord));
  expect(myLeave.container.textContent).toContain("2 calendar days"); await myLeave.close();
  const decision = await render(createElement(HrLeaveRecord, { owner: true }));
  await decision.press("Approved");
  expect(hr.decideLeave).toHaveBeenCalledWith("2", 3, { decision: "approved", expected_version: 0 });
  await decision.press("Rejected");
  await decision.close();
});

it("submits employee, attendance and leave forms through current SDK", async () => {
  const create = await render(createElement(HrEmployeeForm));
  await create.fill("Code", "staff-one"); await create.fill("Active member account ID", "8");
  await create.fill("Display name", "Maya"); await create.fill("IANA timezone", "UTC");
  await create.press("Save employee");
  expect(hr.createEmployee).toHaveBeenCalledWith("2", { code: "staff-one", display_name: "Maya", timezone: "UTC", linked_platform_user_id: 8 });
  await create.close();
  const edit = await render(createElement(HrEmployeeForm, { edit: true }));
  await edit.press("Status:"); await edit.press("Save employee");
  expect(hr.updateEmployee).toHaveBeenCalledWith("2", 3, expect.objectContaining({ expected_version: 0 }));
  await edit.close();
  routing.params.started_at = "";
  routing.params.ended_at = "";
  const attendance = await render(createElement(HrAttendanceForm));
  await attendance.fill("Start with offset", "2026-10-13T01:00:00Z");
  await attendance.fill("End with offset", "2026-10-13T02:00:00Z");
  await attendance.press("Record interval");
  expect(hr.recordAttendance).toHaveBeenCalledWith("2", { started_at: "2026-10-13T01:00:00Z", ended_at: "2026-10-13T02:00:00Z" });
  await attendance.close();
  routing.params.started_at = "2026-10-13T01:00:00Z";
  routing.params.ended_at = "2026-10-13T02:00:00Z";
  const correction = await render(createElement(HrAttendanceForm, { correct: true }));
  await correction.fill("Correction reason", "Corrected"); await correction.press("Save correction");
  expect(hr.correctAttendance).toHaveBeenCalledWith("2", "3", expect.objectContaining({ expected_version: 0, reason: "Corrected" }));
  await correction.close();
  const type = await render(createElement(HrLeaveTypeForm));
  await type.fill("Code", "annual"); await type.fill("Name", "Annual");
  await type.fill("Annual calendar-day allowance", "10"); await type.press("Save leave type");
  expect(hr.createLeaveType).toHaveBeenCalledWith("2", { code: "annual", name: "Annual", allowance_days: 10 });
  await type.close();
  const leaveRequest = await render(createElement(HrLeaveForm));
  await leaveRequest.fill("Start date YYYY-MM-DD", "2026-11-01");
  await leaveRequest.fill("End date YYYY-MM-DD", "2026-11-02");
  await leaveRequest.press("Submit request");
  expect(hr.requestLeave).toHaveBeenCalledWith("2", { leave_type_id: 5, start_date: "2026-11-01", end_date: "2026-11-02" });
  await leaveRequest.close();
});

it("guards signed-out HR pages and makes current server failures retryable", async () => {
  session.user = null;
  for (const element of [createElement(HrHub), createElement(HrDirectory, { kind: "leave" }),
    createElement(HrEmployeeRecord), createElement(HrLeaveRecord), createElement(HrEmployeeForm),
    createElement(HrAttendanceForm), createElement(HrLeaveTypeForm), createElement(HrLeaveForm)]) {
    const view = await render(element);
    expect(view.container.textContent).toContain("Sign in");
    await view.press("Sign in"); await view.close();
  }
  expect(routing.replace).toHaveBeenCalledWith("/platform/login");
  session.user = { id: 8 };
  hr.employees.mockRejectedValueOnce(new Error("Employees unavailable"));
  const directory = await render(createElement(HrDirectory, { kind: "employees" }));
  expect(directory.container.textContent).toContain("Employees unavailable");
  await directory.press("Retry"); expect(directory.container.textContent).toContain("Maya"); await directory.close();
  hr.ownerLeaveDetail.mockRejectedValueOnce(new Error("Leave unavailable"));
  const detail = await render(createElement(HrLeaveRecord, { owner: true }));
  expect(detail.container.textContent).toContain("Leave unavailable");
  await detail.press("Retry"); expect(detail.container.textContent).toContain("2 calendar days"); await detail.close();
});

it("keeps empty and failed HR data scoped to the current page", async () => {
  workspace.organization.mockRejectedValueOnce(new Error("HR organization unavailable"));
  const hub = await render(createElement(HrHub));
  expect(hub.container.textContent).toContain("HR organization unavailable");
  await hub.press("Retry"); expect(hub.container.textContent).toContain("Employees"); await hub.close();
  hr.employees.mockResolvedValueOnce({ data: [], meta });
  const empty = await render(createElement(HrDirectory, { kind: "employees" }));
  expect(empty.container.textContent).toContain("No records on this page");
  await empty.press("HR"); await empty.close();
  const ownerAttendance = await render(createElement(HrDirectory, { kind: "employee-attendance" }));
  await ownerAttendance.press("Employee");
  expect(routing.replace).toHaveBeenCalledWith(hrPath("2", "employees/3"));
  await ownerAttendance.close();
  hr.ownerEmployee.mockRejectedValueOnce(new Error("Employee unavailable"));
  const employeeDetail = await render(createElement(HrEmployeeRecord));
  expect(employeeDetail.container.textContent).toContain("Employee unavailable");
  await employeeDetail.press("Retry"); expect(employeeDetail.container.textContent).toContain("Maya");
  await employeeDetail.press("Employees"); await employeeDetail.close();
  hr.myEmployee.mockResolvedValueOnce({ employee: { ...employee, status: "custom" }, options: {} });
  const statusFallback = await render(createElement(HrEmployeeRecord, { mine: true }));
  expect(statusFallback.container.textContent).toContain("custom");
  await statusFallback.press("HR"); await statusFallback.close();
});

it("surfaces version conflicts and field errors without navigating", async () => {
  hr.decideLeave.mockRejectedValueOnce(new Error("Leave changed"));
  const decision = await render(createElement(HrLeaveRecord, { owner: true }));
  await decision.press("Approved");
  expect(decision.container.textContent).toContain("Leave changed");
  await decision.press("Owner leave"); await decision.close();
  hr.ownerLeaveDetail.mockResolvedValueOnce({ leave: { ...leave, status: "approved" }, options: {} });
  const approved = await render(createElement(HrLeaveRecord, { owner: true }));
  expect(approved.container.textContent).toContain("approved");
  expect(approved.container.textContent).not.toContain("Rejected");
  await approved.close();
  hr.createEmployee.mockRejectedValueOnce(new ApiError("Invalid employee", 422, "validation", { code: ["Reserved"] }));
  const employeeForm = await render(createElement(HrEmployeeForm));
  await employeeForm.press("Save employee");
  expect(employeeForm.container.textContent).toContain("code: Reserved");
  await employeeForm.press("Employees"); await employeeForm.close();
  hr.ownerEmployee.mockRejectedValueOnce(new Error("Edit unavailable"));
  const edit = await render(createElement(HrEmployeeForm, { edit: true }));
  expect(edit.container.textContent).toContain("Edit unavailable");
  await edit.press("Retry"); expect(edit.container.textContent).toContain("Save employee");
  await edit.close();
  hr.recordAttendance.mockRejectedValueOnce(new Error("Interval overlaps"));
  const attendance = await render(createElement(HrAttendanceForm));
  await attendance.press("Record interval");
  expect(attendance.container.textContent).toContain("Interval overlaps");
  await attendance.press("Attendance"); await attendance.close();
  hr.correctAttendance.mockRejectedValueOnce(new ApiError("Invalid correction", 422, "validation", { reason: ["Required"] }));
  const correction = await render(createElement(HrAttendanceForm, { correct: true }));
  await correction.press("Save correction");
  expect(correction.container.textContent).toContain("reason: Required");
  await correction.press("Attendance"); await correction.close();
  hr.createLeaveType.mockRejectedValueOnce(new Error("Code reserved"));
  const leaveTypeForm = await render(createElement(HrLeaveTypeForm));
  await leaveTypeForm.press("Save leave type");
  expect(leaveTypeForm.container.textContent).toContain("Code reserved");
  await leaveTypeForm.press("Leave types"); await leaveTypeForm.close();
  hr.requestLeave.mockRejectedValueOnce(new Error("Allowance exceeded"));
  const leaveForm = await render(createElement(HrLeaveForm));
  await leaveForm.press("Submit request");
  expect(leaveForm.container.textContent).toContain("Allowance exceeded");
  await leaveForm.press("My leave"); await leaveForm.close();
});

it("handles leave-type pages, unavailable types and retry", async () => {
  hr.leaveTypes.mockResolvedValueOnce({ data: [], meta });
  const empty = await render(createElement(HrLeaveForm));
  expect(empty.container.textContent).toContain("No active leave types");
  expect(empty.button("Submit request").disabled).toBe(true);
  await empty.press("Next types");
  expect(hr.leaveTypes).toHaveBeenCalledWith("2", 2, "active");
  await empty.press("Previous types");
  await empty.close();
  hr.leaveTypes.mockRejectedValueOnce(new Error("Leave types unavailable"));
  const error = await render(createElement(HrLeaveForm));
  expect(error.container.textContent).toContain("Leave types unavailable");
  await error.press("Retry");
  expect(error.container.textContent).toContain("Annual");
  await error.press("Type:");
  await error.close();
});

it("uses fallback labels and only acts on versioned current records", async () => {
  hr.ownerLeaveDetail.mockResolvedValueOnce({ leave, options: {} });
  const leaveView = await render(createElement(HrLeaveRecord, { owner: true }));
  expect(leaveView.container.textContent).toContain("pending");
  await leaveView.press("Approve");
  await leaveView.press("Owner leave");
  await leaveView.close();
  const own = await render(createElement(HrLeaveRecord));
  await own.press("My leave"); await own.close();
  hr.ownerEmployee.mockResolvedValueOnce({ employee, options: {} });
  const employeeForm = await render(createElement(HrEmployeeForm, { edit: true }));
  expect(employeeForm.container.textContent).toContain("Status: Choose");
  await employeeForm.press("Status:");
  await employeeForm.press("Save employee");
  await employeeForm.close();
  const untouchedEdit = await render(createElement(HrEmployeeForm, { edit: true }));
  await untouchedEdit.press("Save employee");
  await untouchedEdit.close();
  hr.ownerAttendance.mockResolvedValueOnce({ data: [{ id: 4, employee_id: 3, local_date: "2026-10-13",
    timezone: "Asia/Kuala_Lumpur", version: 0, started_at: undefined, ended_at: undefined }], meta });
  const missingTimes = await render(createElement(HrDirectory, { kind: "employee-attendance" }));
  await missingTimes.press("2026-10-13");
  expect(routing.push).toHaveBeenCalledWith(hrPath("2", "attendance/4/correct?employee_id=3&version=0&started_at=&ended_at="));
  await missingTimes.close();
  hr.ownerLeave.mockResolvedValueOnce({ data: [{ id: 4 }], meta });
  const fallbackRow = await render(createElement(HrDirectory, { kind: "owner-leave" }));
  expect(fallbackRow.container.textContent).toContain("Record 4");
  await fallbackRow.close();
});

it("prevents a second mutation while each HR form or decision is pending", async () => {
  buttons.ignoreDisabled = true;
  const employeePending = deferred<{ employee: typeof employee }>();
  hr.createEmployee.mockImplementationOnce(() => employeePending.promise);
  const employeeForm = await render(createElement(HrEmployeeForm));
  await employeeForm.press("Save employee"); await employeeForm.press("Save employee");
  expect(hr.createEmployee).toHaveBeenCalledTimes(1);
  await act(async () => employeePending.release({ employee })); await employeeForm.close();

  const attendancePending = deferred<{ attendance: typeof attendance }>();
  hr.recordAttendance.mockImplementationOnce(() => attendancePending.promise);
  const attendanceForm = await render(createElement(HrAttendanceForm));
  await attendanceForm.press("Record interval"); await attendanceForm.press("Record interval");
  expect(hr.recordAttendance).toHaveBeenCalledTimes(1);
  await act(async () => attendancePending.release({ attendance })); await attendanceForm.close();

  const typePending = deferred<{ leave_type: typeof leaveType; options: typeof meta.options.status }>();
  hr.createLeaveType.mockImplementationOnce(() => typePending.promise);
  const typeForm = await render(createElement(HrLeaveTypeForm));
  await typeForm.press("Save leave type"); await typeForm.press("Save leave type");
  expect(hr.createLeaveType).toHaveBeenCalledTimes(1);
  await act(async () => typePending.release({ leave_type: leaveType, options: meta.options.status })); await typeForm.close();

  const leavePending = deferred<{ leave: typeof leave }>();
  hr.requestLeave.mockImplementationOnce(() => leavePending.promise);
  const leaveForm = await render(createElement(HrLeaveForm));
  await leaveForm.press("Submit request"); await leaveForm.press("Submit request");
  expect(hr.requestLeave).toHaveBeenCalledTimes(1);
  await act(async () => leavePending.release({ leave })); await leaveForm.close();

  const decisionPending = deferred<{ leave: typeof leave; options: typeof meta.options.status }>();
  hr.decideLeave.mockImplementationOnce(() => decisionPending.promise);
  const decision = await render(createElement(HrLeaveRecord, { owner: true }));
  await decision.press("Approved"); await decision.press("Approved");
  expect(hr.decideLeave).toHaveBeenCalledTimes(1);
  await act(async () => decisionPending.release({ leave, options: meta.options.status })); await decision.close();
});

it("keeps direct attendance links editable when no interval was passed in navigation", async () => {
  routing.params.started_at = undefined as unknown as string;
  routing.params.ended_at = undefined as unknown as string;
  const record = await render(createElement(HrAttendanceForm));
  expect(record.container.querySelector<HTMLInputElement>('input[aria-label="Start with offset"]')?.value).toBe("");
  await record.close();
  const correct = await render(createElement(HrAttendanceForm, { correct: true }));
  await correct.press("Save correction");
  expect(hr.correctAttendance).toHaveBeenCalledWith("2", "3", {
    started_at: "", ended_at: "", reason: "", expected_version: 0,
  });
  await correct.close();
});
