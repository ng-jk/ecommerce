import { z } from "zod";

const id = z.number().int().positive();
export const helpdeskId = z.coerce.number().int().positive();
export const helpdeskPage = z.number().int().positive();
const version = z.number().int().nonnegative();
const options = z.object({ status: z.record(z.string()) });
const pagination = z.object({
  current_page: helpdeskPage,
  last_page: helpdeskPage,
  total: z.number().int().nonnegative(),
  per_page: helpdeskPage,
  options,
});

export const queue = z.object({
  id,
  code: z.string(),
  name: z.string(),
  status: z.string(),
  version,
});
export type HelpdeskQueue = z.infer<typeof queue>;
export const agent = z.object({
  id,
  queue_id: id,
  platform_user_id: id,
  status: z.string(),
  version,
});
export type HelpdeskAgent = z.infer<typeof agent>;
export const requesterTicketSummary = z.object({
  id,
  queue_id: id,
  subject: z.string(),
  status: z.string(),
  version,
});
export const requesterTicket = requesterTicketSummary.extend({
  description: z.string(),
});
export const staffTicketSummary = requesterTicketSummary.extend({
  requester_platform_user_id: id,
  assigned_platform_user_id: id.nullable(),
});
export const staffTicket = staffTicketSummary.extend({
  description: z.string(),
});
export type HelpdeskRequesterTicketSummary = z.infer<
  typeof requesterTicketSummary
>;
export type HelpdeskStaffTicketSummary = z.infer<typeof staffTicketSummary>;
export type HelpdeskRequesterTicket = z.infer<typeof requesterTicket>;
export type HelpdeskStaffTicket = z.infer<typeof staffTicket>;

export const queueList = z.object({ data: z.array(queue), meta: pagination });
export const agentList = z.object({ data: z.array(agent), meta: pagination });
export const requesterTicketList = z.object({
  data: z.array(requesterTicketSummary),
  meta: pagination,
});
export const staffTicketList = z.object({
  data: z.array(staffTicketSummary),
  meta: pagination,
});
export const queueDetail = z.object({ queue, options });
export const agentDetail = z.object({ agent, options });
export const requesterTicketDetail = z.object({
  ticket: requesterTicket,
  options,
});
export const staffTicketDetail = z.object({ ticket: staffTicket, options });

export const createQueue = z
  .object({
    code: z
      .string()
      .min(3)
      .max(80)
      .regex(/^[a-z][a-z0-9-]*$/),
    name: z.string().trim().min(1).max(160),
  })
  .strict();
export const updateQueue = z
  .object({
    name: z.string().trim().min(1).max(160),
    status: z.string().min(1),
    expected_version: version,
  })
  .strict();
export const assignAgent = z
  .object({
    queue_id: id,
    target_platform_user_id: id,
    expected_version: version.optional(),
  })
  .strict();
export const expectedVersion = z.object({ expected_version: version }).strict();
export const createTicket = z
  .object({
    queue_id: id,
    subject: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(10000),
  })
  .strict();
export const assignTicket = z
  .object({ assigned_platform_user_id: id, expected_version: version })
  .strict();
export const changeTicketStatus = z
  .object({ status: z.string().min(1), expected_version: version })
  .strict();
