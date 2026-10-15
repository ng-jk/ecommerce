import type { z } from "zod";
import {
  erpId,
  erpPage,
  accountsList,
  accountDetail,
  journalsList,
  journalDetail,
  ledgerList,
  createAccount,
  updateAccount,
  createJournal,
  updateJournal,
  postJournal,
  reverseJournal,
} from "../logic/contracts";

type Request = <T>(
  path: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  method?: string,
  body?: unknown,
) => Promise<T>;

export function createErpClient(request: Request) {
  const base = (organizationId: string | number) =>
    `organizations/${erpId.parse(organizationId)}/erp`;
  const record = (
    organizationId: string | number,
    collection: string,
    id: string | number,
  ) => `${base(organizationId)}/${collection}/${erpId.parse(id)}`;
  const page = (value: number) => erpPage.parse(value);
  return {
    accounts: (
      organizationId: string | number,
      currentPage = 1,
      type = "",
      perPage = 20,
    ) =>
      request(
        `${base(organizationId)}/accounts?page=${page(currentPage)}&per_page=${erpPage.max(50).parse(perPage)}${type ? `&type=${encodeURIComponent(type)}` : ""}`,
        accountsList,
      ),
    account: (organizationId: string | number, id: string | number) =>
      request(record(organizationId, "accounts", id), accountDetail),
    createAccount: (
      organizationId: string | number,
      input: z.input<typeof createAccount>,
    ) =>
      request(
        `${base(organizationId)}/accounts`,
        accountDetail,
        "POST",
        createAccount.parse(input),
      ),
    updateAccount: (
      organizationId: string | number,
      id: string | number,
      input: z.input<typeof updateAccount>,
    ) =>
      request(
        record(organizationId, "accounts", id),
        accountDetail,
        "PATCH",
        updateAccount.parse(input),
      ),
    journals: (
      organizationId: string | number,
      currentPage = 1,
      status = "",
      perPage = 20,
    ) =>
      request(
        `${base(organizationId)}/journals?page=${page(currentPage)}&per_page=${erpPage.max(50).parse(perPage)}${status ? `&status=${encodeURIComponent(status)}` : ""}`,
        journalsList,
      ),
    journal: (organizationId: string | number, id: string | number) =>
      request(record(organizationId, "journals", id), journalDetail),
    createJournal: (
      organizationId: string | number,
      input: z.input<typeof createJournal>,
    ) =>
      request(
        `${base(organizationId)}/journals`,
        journalDetail,
        "POST",
        createJournal.parse(input),
      ),
    updateJournal: (
      organizationId: string | number,
      id: string | number,
      input: z.input<typeof updateJournal>,
    ) =>
      request(
        record(organizationId, "journals", id),
        journalDetail,
        "PATCH",
        updateJournal.parse(input),
      ),
    postJournal: (
      organizationId: string | number,
      id: string | number,
      input: z.input<typeof postJournal>,
    ) =>
      request(
        `${record(organizationId, "journals", id)}/post`,
        journalDetail,
        "POST",
        postJournal.parse(input),
      ),
    reverseJournal: (
      organizationId: string | number,
      id: string | number,
      input: z.input<typeof reverseJournal>,
    ) =>
      request(
        `${record(organizationId, "journals", id)}/reverse`,
        journalDetail,
        "POST",
        reverseJournal.parse(input),
      ),
    ledger: (
      organizationId: string | number,
      accountId: string | number,
      currentPage = 1,
      perPage = 20,
    ) =>
      request(
        `${base(organizationId)}/ledger?account_id=${erpId.parse(accountId)}&page=${page(currentPage)}&per_page=${erpPage.max(50).parse(perPage)}`,
        ledgerList,
      ),
  };
}
