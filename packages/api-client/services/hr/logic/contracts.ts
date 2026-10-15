import { z } from "zod";

const id = z.number().int().positive();
export const hrId = z.coerce.number().int().positive();
export const hrPage = z.number().int().positive();
const version = z.number().int().nonnegative();
const labels = z.record(z.string());
const options = z.object({ status: labels });
const pageMeta = z.object({
  current_page: hrPage,
  last_page: hrPage,
  total: z.number().int().nonnegative(),
  per_page: hrPage,
  options,
});

export const employee = z.object({
  id,
  code: z.string(),
  display_name: z.string(),
  linked_platform_user_id: id,
  timezone: z.string(),
  status: z.string(),
  version,
});
export type HrEmployee = z.infer<typeof employee>;
export const attendance = z.object({
  id,
  employee_id: id,
  started_at: z.string(),
  ended_at: z.string(),
  local_date: z.string(),
  timezone: z.string(),
  version,
});
export type HrAttendance = z.infer<typeof attendance>;
export const correction = z.object({
  id,
  attendance_id: id,
  corrected_by_platform_user_id: id,
  old_started_at: z.string(),
  old_ended_at: z.string(),
  new_started_at: z.string(),
  new_ended_at: z.string(),
  reason: z.string(),
});
export const leaveType = z.object({
  id,
  code: z.string(),
  name: z.string(),
  allowance_days: z.number().int().nonnegative(),
  status: z.string(),
});
export type HrLeaveType = z.infer<typeof leaveType>;
export const leaveRequest = z.object({
  id,
  employee_id: id,
  leave_type_id: id,
  start_date: z.string(),
  end_date: z.string(),
  calendar_days: z.number().int().positive(),
  status: z.string(),
  version,
  decided_by_platform_user_id: id.nullable().optional(),
  decided_at: z.string().nullable().optional(),
});
export type HrLeaveRequest = z.infer<typeof leaveRequest>;

export const employeeList = z.object({
  data: z.array(employee),
  meta: pageMeta,
});
export const employeeDetail = z.object({ employee, options: labels });
export const attendanceList = z.object({
  data: z.array(attendance),
  meta: pageMeta,
});
export const attendanceDetail = z.object({ attendance });
export const attendanceCorrection = z.object({ attendance, correction });
export const leaveTypeList = z.object({
  data: z.array(leaveType),
  meta: pageMeta,
});
export const leaveTypeDetail = z.object({
  leave_type: leaveType,
  options: labels,
});
export const leaveList = z.object({
  data: z.array(leaveRequest),
  meta: pageMeta,
});
export const leaveDetail = z.object({ leave: leaveRequest, options: labels });

const code = z
  .string()
  .min(3)
  .max(80)
  .regex(/^[a-z][a-z0-9-]*$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const offsetTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/);
export const createEmployee = z
  .object({
    code,
    display_name: z.string().trim().min(1).max(200),
    timezone: z.string().min(1).max(64),
    linked_platform_user_id: id,
  })
  .strict();
export const updateEmployee = z
  .object({
    display_name: z.string().trim().min(1).max(200),
    timezone: z.string().min(1).max(64),
    status: z.string().min(1),
    expected_version: version,
  })
  .strict();
export const recordAttendance = z
  .object({ started_at: offsetTime, ended_at: offsetTime })
  .strict();
export const correctAttendance = recordAttendance
  .extend({
    reason: z.string().trim().min(1).max(2000),
    expected_version: version,
  })
  .strict();
export const createLeaveType = z
  .object({
    code,
    name: z.string().trim().min(1).max(160),
    allowance_days: z.number().int().min(0).max(366),
  })
  .strict();
export const requestLeave = z
  .object({ leave_type_id: id, start_date: date, end_date: date })
  .strict();
export const decideLeave = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    expected_version: version,
  })
  .strict();
