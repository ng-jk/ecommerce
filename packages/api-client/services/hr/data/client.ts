import type { z } from "zod";
import {
  hrId,
  hrPage,
  employeeList,
  employeeDetail,
  attendanceList,
  attendanceDetail,
  attendanceCorrection,
  leaveTypeList,
  leaveTypeDetail,
  leaveList,
  leaveDetail,
  createEmployee,
  updateEmployee,
  recordAttendance,
  correctAttendance,
  createLeaveType,
  requestLeave,
  decideLeave,
} from "../logic/contracts";

type Request = <T>(
  path: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  method?: string,
  body?: unknown,
) => Promise<T>;

export function createHrClient(request: Request) {
  const base = (organizationId: string | number) =>
    `organizations/${hrId.parse(organizationId)}/hr`;
  const record = (
    organizationId: string | number,
    collection: string,
    recordId: string | number,
  ) => `${base(organizationId)}/${collection}/${hrId.parse(recordId)}`;
  const list = (
    organizationId: string | number,
    collection: string,
    page: number,
    filters: Record<string, string | number>,
  ) => {
    const query = new URLSearchParams({
      page: String(hrPage.parse(page)),
      per_page: "3",
    });
    for (const [key, value] of Object.entries(filters))
      if (value !== "") query.set(key, String(value));
    return `${base(organizationId)}/${collection}?${query.toString()}`;
  };
  return {
    employees: (organizationId: string | number, page = 1, status = "") =>
      request(
        list(organizationId, "employees", page, { status }),
        employeeList,
      ),
    createEmployee: (
      organizationId: string | number,
      input: z.input<typeof createEmployee>,
    ) =>
      request(
        `${base(organizationId)}/employees`,
        employeeDetail,
        "POST",
        createEmployee.parse(input),
      ),
    ownerEmployee: (organizationId: string | number, id: string | number) =>
      request(record(organizationId, "owner/employees", id), employeeDetail),
    myEmployee: (organizationId: string | number) =>
      request(`${base(organizationId)}/employees/me`, employeeDetail),
    updateEmployee: (
      organizationId: string | number,
      id: string | number,
      input: z.input<typeof updateEmployee>,
    ) =>
      request(
        record(organizationId, "employees", id),
        employeeDetail,
        "PATCH",
        updateEmployee.parse(input),
      ),
    myAttendance: (organizationId: string | number, page = 1, localDate = "") =>
      request(
        list(organizationId, "attendance", page, { local_date: localDate }),
        attendanceList,
      ),
    recordAttendance: (
      organizationId: string | number,
      input: z.input<typeof recordAttendance>,
    ) =>
      request(
        `${base(organizationId)}/attendance`,
        attendanceDetail,
        "POST",
        recordAttendance.parse(input),
      ),
    ownerAttendance: (
      organizationId: string | number,
      id: string | number,
      page = 1,
      localDate = "",
    ) =>
      request(
        list(organizationId, `employees/${hrId.parse(id)}/attendance`, page, {
          local_date: localDate,
        }),
        attendanceList,
      ),
    correctAttendance: (
      organizationId: string | number,
      id: string | number,
      input: z.input<typeof correctAttendance>,
    ) =>
      request(
        `${record(organizationId, "attendance", id)}/correct`,
        attendanceCorrection,
        "POST",
        correctAttendance.parse(input),
      ),
    leaveTypes: (organizationId: string | number, page = 1, status = "") =>
      request(
        list(organizationId, "leave-types", page, { status }),
        leaveTypeList,
      ),
    createLeaveType: (
      organizationId: string | number,
      input: z.input<typeof createLeaveType>,
    ) =>
      request(
        `${base(organizationId)}/leave-types`,
        leaveTypeDetail,
        "POST",
        createLeaveType.parse(input),
      ),
    myLeave: (organizationId: string | number, page = 1, status = "") =>
      request(list(organizationId, "leave", page, { status }), leaveList),
    requestLeave: (
      organizationId: string | number,
      input: z.input<typeof requestLeave>,
    ) =>
      request(
        `${base(organizationId)}/leave`,
        leaveDetail,
        "POST",
        requestLeave.parse(input),
      ),
    myLeaveDetail: (organizationId: string | number, id: string | number) =>
      request(record(organizationId, "leave", id), leaveDetail),
    ownerLeave: (
      organizationId: string | number,
      page = 1,
      status = "",
      employeeId: string | number | "" = "",
    ) =>
      request(
        list(organizationId, "owner/leave", page, {
          status,
          employee_id: employeeId === "" ? "" : hrId.parse(employeeId),
        }),
        leaveList,
      ),
    ownerLeaveDetail: (organizationId: string | number, id: string | number) =>
      request(record(organizationId, "owner/leave", id), leaveDetail),
    decideLeave: (
      organizationId: string | number,
      id: string | number,
      input: z.input<typeof decideLeave>,
    ) =>
      request(
        `${record(organizationId, "owner/leave", id)}/decide`,
        leaveDetail,
        "POST",
        decideLeave.parse(input),
      ),
  };
}
