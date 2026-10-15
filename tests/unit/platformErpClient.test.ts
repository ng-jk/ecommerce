import type { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { createErpClient } from "../../packages/api-client/services/erp";

const account = {
  id: 2,
  code: "cash",
  name: "Cash",
  type: "asset",
  version: 0,
};
const journal = {
  id: 3,
  effective_date: "2026-10-13",
  description: "Sale",
  currency: "USD",
  status: "draft",
  version: 0,
  total_minor: 100,
  posted_at: null,
  reverses_journal_id: null,
  lines: [
    { id: 4, position: 1, account_id: 2, debit_minor: 100, credit_minor: 0 },
    { id: 5, position: 2, account_id: 6, debit_minor: 0, credit_minor: 100 },
  ],
};
const accountOptions = { type: { asset: "Asset", revenue: "Revenue" } };
const journalOptions = { status: { draft: "Draft", posted: "Posted" } };
const paging = { current_page: 1, per_page: 20, last_page: 1, total: 1 };
const journalInput = {
  effective_date: "2026-10-13",
  description: "Sale",
  currency: "USD",
  lines: [
    { account_id: 2, debit_minor: 100, credit_minor: 0 },
    { account_id: 6, debit_minor: 0, credit_minor: 100 },
  ],
};

describe("standalone ERP SDK", () => {
  it("routes all eleven account, journal, and ledger actions through validated transport", async () => {
    const request = vi.fn(
      async <T>(
        path: string,
        schema: z.ZodType<T, z.ZodTypeDef, unknown>,
        _method?: string,
        _body?: unknown,
      ) => {
        const result = path.includes("/ledger?")
          ? {
              data: [
                {
                  id: 4,
                  journal_id: 3,
                  account_id: 2,
                  debit_minor: 100,
                  credit_minor: 0,
                },
              ],
              meta: paging,
            }
          : path.includes("/accounts?")
            ? { data: [account], meta: { ...paging, options: accountOptions } }
            : path.includes("/journals?")
              ? {
                  data: [journal],
                  meta: { ...paging, options: journalOptions },
                }
              : path.includes("/accounts")
                ? { account, options: accountOptions }
                : { journal, options: journalOptions };
        return schema.parse(result);
      },
    );
    const api = createErpClient(async (path, schema, method, body) =>
      schema.parse(
        await (method === undefined
          ? request(path, schema)
          : request(path, schema, method, body)),
      ),
    );
    expect((await api.accounts(1)).data[0]?.code).toBe("cash");
    expect((await api.account(1, 2)).account.id).toBe(2);
    expect(
      (
        await api.createAccount(1, {
          code: "cash",
          name: "Cash",
          type: "asset",
        })
      ).account.id,
    ).toBe(2);
    expect(
      (await api.updateAccount(1, 2, { name: "Cash box", expected_version: 0 }))
        .account.id,
    ).toBe(2);
    expect((await api.journals(1)).data[0]?.id).toBe(3);
    expect((await api.journal(1, 3)).journal.lines).toHaveLength(2);
    expect((await api.createJournal(1, journalInput)).journal.id).toBe(3);
    expect(
      (await api.updateJournal(1, 3, { ...journalInput, expected_version: 0 }))
        .journal.id,
    ).toBe(3);
    expect(
      (await api.postJournal(1, 3, { expected_version: 0 })).journal.id,
    ).toBe(3);
    expect(
      (
        await api.reverseJournal(1, 3, {
          expected_version: 1,
          effective_date: "2026-10-13",
        })
      ).journal.id,
    ).toBe(3);
    expect((await api.ledger(1, 2)).data[0]?.debit_minor).toBe(100);
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      "organizations/1/erp/accounts?page=1&per_page=20",
      "organizations/1/erp/accounts/2",
      "organizations/1/erp/accounts",
      "organizations/1/erp/accounts/2",
      "organizations/1/erp/journals?page=1&per_page=20",
      "organizations/1/erp/journals/3",
      "organizations/1/erp/journals",
      "organizations/1/erp/journals/3",
      "organizations/1/erp/journals/3/post",
      "organizations/1/erp/journals/3/reverse",
      "organizations/1/erp/ledger?account_id=2&page=1&per_page=20",
    ]);
    await api.accounts(1, 2, "asset");
    await api.journals(1, 2, "posted");
    expect(request.mock.calls.at(-2)?.[0]).toContain("type=asset");
    expect(request.mock.calls.at(-1)?.[0]).toContain("status=posted");
  });

  it("rejects unbalanced floats, unsafe dates, and invalid scoped identifiers before request", () => {
    const request = vi.fn(
      async <T>(
        _path: string,
        schema: z.ZodType<T, z.ZodTypeDef, unknown>,
        _method?: string,
        _body?: unknown,
      ): Promise<T> => schema.parse({}),
    );
    const api = createErpClient(async (path, schema, method, body) =>
      schema.parse(
        await (method === undefined
          ? request(path, schema)
          : request(path, schema, method, body)),
      ),
    );
    expect(() =>
      api.createJournal(1, { ...journalInput, effective_date: "2026-02-30" }),
    ).toThrow();
    expect(() =>
      api.createJournal(1, {
        ...journalInput,
        lines: [
          { account_id: 2, debit_minor: 1.5, credit_minor: 0 },
          { account_id: 6, debit_minor: 0, credit_minor: 1.5 },
        ],
      }),
    ).toThrow();
    expect(() =>
      api.createJournal(1, {
        ...journalInput,
        lines: [
          { account_id: 2, debit_minor: 101, credit_minor: 0 },
          { account_id: 6, debit_minor: 0, credit_minor: 100 },
        ],
      }),
    ).toThrow();
    expect(() =>
      api.createJournal(1, {
        ...journalInput,
        lines: [
          { account_id: 2, debit_minor: 100, credit_minor: 100 },
          { account_id: 6, debit_minor: 0, credit_minor: 100 },
        ],
      }),
    ).toThrow();
    expect(() => api.account("bad", 2)).toThrow();
    expect(() => api.ledger(1, "bad")).toThrow();
    expect(() => api.postJournal(1, 3, { expected_version: -1 })).toThrow();
    expect(() =>
      api.reverseJournal(1, 3, {
        expected_version: 0,
        effective_date: "2026-02-30",
      }),
    ).toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});
