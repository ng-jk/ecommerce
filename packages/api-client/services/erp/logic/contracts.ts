import { z } from "zod";

const id = z.number().int().positive();
export const erpId = z.coerce.number().int().positive();
export const erpPage = z.number().int().positive();
const version = z.number().int().nonnegative();
const maxMinor = 9_000_000_000_000_000;
const amount = z.number().int().nonnegative().max(maxMinor);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });
const name = z.string().trim().min(1).max(200);
const description = z.string().trim().min(1).max(500);
const currency = z.string().regex(/^[A-Z]{3}$/);
const options = z.object({ status: z.record(z.string()) });
const accountOptions = z.object({ type: z.record(z.string()) });
const pagination = z.object({
  current_page: erpPage,
  per_page: erpPage,
  last_page: erpPage,
  total: z.number().int().nonnegative(),
});

export const erpAccount = z.object({
  id,
  code: z.string(),
  name: z.string(),
  type: z.string(),
  version,
});
export type ErpAccount = z.infer<typeof erpAccount>;
export const erpJournalLine = z.object({
  id,
  position: id,
  account_id: id,
  debit_minor: amount,
  credit_minor: amount,
});
export type ErpJournalLine = z.infer<typeof erpJournalLine>;
const summary = z.object({
  id,
  effective_date: date,
  description: z.string(),
  currency,
  status: z.string(),
  version,
  total_minor: amount,
  posted_at: z.string().datetime({ offset: true }).nullable(),
  reverses_journal_id: id.nullable(),
});
export const erpJournal = summary.extend({ lines: z.array(erpJournalLine) });
export type ErpJournal = z.infer<typeof erpJournal>;
export const erpLedgerLine = z.object({
  id,
  journal_id: id,
  account_id: id,
  debit_minor: amount,
  credit_minor: amount,
});
export const accountsList = z.object({
  data: z.array(erpAccount),
  meta: pagination.extend({ options: accountOptions }),
});
export const accountDetail = z.object({
  account: erpAccount,
  options: accountOptions,
});
export const journalsList = z.object({
  data: z.array(summary),
  meta: pagination.extend({ options }),
});
export const journalDetail = z.object({ journal: erpJournal, options });
export const ledgerList = z.object({
  data: z.array(erpLedgerLine),
  meta: pagination,
});
export const createAccount = z
  .object({
    code: z
      .string()
      .min(2)
      .max(40)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name,
    type: z.string().min(1),
  })
  .strict();
export const updateAccount = z
  .object({ name, expected_version: version })
  .strict();
const journalInputLine = z
  .object({ account_id: id, debit_minor: amount, credit_minor: amount })
  .strict()
  .refine((line) => line.debit_minor > 0 !== line.credit_minor > 0);
const lines = z
  .array(journalInputLine)
  .min(2)
  .max(100)
  .refine((value) => {
    const debit = value.reduce((sum, line) => sum + line.debit_minor, 0);
    const credit = value.reduce((sum, line) => sum + line.credit_minor, 0);
    return debit > 0 && debit === credit && debit <= maxMinor;
  });
export const createJournal = z
  .object({ effective_date: date, description, currency, lines })
  .strict();
export const updateJournal = createJournal.extend({
  expected_version: version,
});
export const postJournal = z.object({ expected_version: version }).strict();
export const reverseJournal = z
  .object({ expected_version: version, effective_date: date })
  .strict();
