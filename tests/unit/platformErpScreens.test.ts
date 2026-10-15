// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "../../packages/api-client";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const routing = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), params: {
  id: "7", recordId: "3", accountId: "2",
} }));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return { router: routing, useLocalSearchParams: () => routing.params,
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]) };
});
const account = { id: 3, code: "cash", name: "Cash", type: "asset", version: 1 };
const journal = { id: 3, effective_date: "2026-10-13", description: "Opening", currency: "USD",
  status: "draft", version: 1, total_minor: 100, posted_at: null, reverses_journal_id: null,
  lines: [{ id: 4, position: 1, account_id: 2, debit_minor: 100, credit_minor: 0 },
    { id: 5, position: 2, account_id: 6, debit_minor: 0, credit_minor: 100 }] };
const accountOptions = { type: { asset: "Asset", revenue: "Revenue" } };
const journalOptions = { status: { draft: "Draft", posted: "Posted" } };
const meta = { current_page: 1, per_page: 2, last_page: 2, total: 3 };
const erp = {
  accounts: vi.fn(async () => ({ data: [account], meta: { ...meta, options: accountOptions } })),
  account: vi.fn(async () => ({ account, options: accountOptions })),
  createAccount: vi.fn(async () => ({ account, options: accountOptions })),
  updateAccount: vi.fn(async () => ({ account, options: accountOptions })),
  journals: vi.fn(async () => ({ data: [journal], meta: { ...meta, options: journalOptions } })),
  journal: vi.fn(async () => ({ journal, options: journalOptions })),
  createJournal: vi.fn(async () => ({ journal, options: journalOptions })),
  updateJournal: vi.fn(async () => ({ journal, options: journalOptions })),
  postJournal: vi.fn(async () => ({ journal: { ...journal, status: "posted" }, options: journalOptions })),
  reverseJournal: vi.fn(async () => ({ journal: { ...journal, id: 9 }, options: journalOptions })),
  ledger: vi.fn(async () => ({ data: [{ id: 4, journal_id: 3, account_id: 2, debit_minor: 100,
    credit_minor: 0 }], meta })),
};
const session = { api: { erp }, user: { id: 9 } as { id: number } | null };
vi.mock("../../frontend/admin/src/screens/platform_shell_screen", () => ({
  usePlatformSession: () => session,
  PlatformPage: ({ title, children }: { title: string; children: ReactNode }) =>
    createElement("main", {}, createElement("h1", {}, title), children),
  PlatformText: ({ children }: { children: ReactNode }) => createElement("p", {}, children),
  PlatformButton: ({ title, onPress, disabled }: { title: string; onPress(): void; disabled?: boolean }) =>
    createElement("button", { onClick: onPress, disabled }, title),
  PlatformField: ({ label, value, onChangeText }: {
    label: string; value: string; onChangeText(value: string): void;
  }) => createElement("input", { "aria-label": label, value,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChangeText(event.currentTarget.value) }),
}));

import { ErpAccountCreatePage, ErpAccountDetail, ErpAccountEditPage, ErpAccountsDirectory,
  ErpHub, ErpJournalCreatePage, ErpJournalDetail, ErpJournalEditPage, ErpJournalsDirectory,
  ErpLedger } from "../../frontend/admin/src/screens/platform_erp_screen";
import { ErpAccountForm } from "../../frontend/admin/src/screens/platform_erp_screen/interface/AccountForm";
import { ErpJournalForm } from "../../frontend/admin/src/screens/platform_erp_screen/interface/JournalForm";
import { erpPath } from "../../frontend/admin/src/screens/platform_erp_screen/logic/model";
import { useErpAccounts, useErpJournals } from "../../frontend/admin/src/screens/platform_erp_screen/logic/useErpDirectory";

beforeEach(() => {
  vi.clearAllMocks();
  session.user = { id: 9 };
  erp.accounts.mockResolvedValue({ data: [account], meta: { ...meta, options: accountOptions } });
  erp.account.mockResolvedValue({ account, options: accountOptions });
  erp.journals.mockResolvedValue({ data: [journal], meta: { ...meta, options: journalOptions } });
  erp.journal.mockResolvedValue({ journal, options: journalOptions });
  erp.ledger.mockResolvedValue({ data: [{ id: 4, journal_id: 3, account_id: 2,
    debit_minor: 100, credit_minor: 0 }], meta });
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
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    },
    async close() { await act(async () => root.unmount()); },
  };
}

it("navigates the ERP hub and paginated model-owned account and journal filters", async () => {
  const hub = await render(createElement(ErpHub));
  await hub.press("Services"); await hub.press("Chart of accounts"); await hub.press("Journals");
  expect(routing.replace).toHaveBeenCalledWith("/platform/organizations/7/service-hub");
  await hub.close();
  const accounts = await render(createElement(ErpAccountsDirectory));
  expect(erp.accounts).toHaveBeenCalledWith("7", 1, "", 2);
  await accounts.press("Type:");
  expect(erp.accounts).toHaveBeenLastCalledWith("7", 1, "asset", 2);
  await accounts.press("Next"); await accounts.press("Previous");
  await accounts.press("cash"); await accounts.press("Create account"); await accounts.press("General ledger");
  expect(accounts.container.querySelectorAll("button").length).toBeLessThanOrEqual(7);
  await accounts.close();
  const journals = await render(createElement(ErpJournalsDirectory));
  await journals.press("Status:");
  expect(erp.journals).toHaveBeenLastCalledWith("7", 1, "draft", 2);
  await journals.press("Next"); await journals.press("Previous");
  await journals.press("Opening"); await journals.press("Create draft"); await journals.press("General ledger");
  expect(journals.container.querySelectorAll("button").length).toBeLessThanOrEqual(7);
  await journals.close();
});

it("creates and edits accounts with current version, field feedback, and immutable code and type", async () => {
  const create = await render(createElement(ErpAccountCreatePage));
  await create.fill("Code", "bank"); await create.fill("Name", "Bank"); await create.press("Type:");
  await create.press("Create account");
  expect(erp.createAccount).toHaveBeenCalledWith("7", { code: "bank", name: "Bank", type: "asset" });
  await create.press("Cancel"); await create.close();
  const edit = await render(createElement(ErpAccountEditPage));
  expect(edit.container.textContent).toContain("Code: cash");
  await edit.fill("Name", "Petty cash"); await edit.press("Save account");
  expect(erp.updateAccount).toHaveBeenCalledWith("7", 3, { name: "Petty cash", expected_version: 1 });
  await edit.close();
  erp.createAccount.mockRejectedValueOnce(new ApiError("Invalid", 422, "validation", { code: ["Duplicate"] }));
  const invalid = await render(createElement(ErpAccountForm, { organizationId: "7", options: accountOptions.type }));
  await invalid.press("Create account"); expect(invalid.container.textContent).toContain("Duplicate");
  await invalid.close();
});

it("uses balanced two-line journal forms and current versions for post and reversal", async () => {
  const create = await render(createElement(ErpJournalCreatePage));
  await create.fill("Description", "Opening"); await create.fill("Debit account ID", "2");
  await create.fill("Credit account ID", "6"); await create.fill("Amount (minor units)", "100");
  await create.press("Create draft");
  expect(erp.createJournal.mock.calls[0]?.[1]).toMatchObject({ description: "Opening", currency: "USD", lines: [
    { account_id: 2, debit_minor: 100, credit_minor: 0 }, { account_id: 6, debit_minor: 0, credit_minor: 100 },
  ] });
  await create.press("Cancel"); await create.close();
  const edit = await render(createElement(ErpJournalEditPage));
  await edit.press("Save draft");
  expect(erp.updateJournal.mock.calls[0]?.[2]).toMatchObject({ expected_version: 1 });
  await edit.close();
  const detail = await render(createElement(ErpJournalDetail));
  await detail.press("Edit draft"); await detail.press("Post journal");
  expect(erp.postJournal).toHaveBeenCalledWith("7", 3, { expected_version: 1 });
  await detail.press("Journals");
  await detail.close();
  erp.journal.mockResolvedValue({ journal: { ...journal, status: "posted" }, options: journalOptions });
  const posted = await render(createElement(ErpJournalDetail));
  await posted.press("Reverse journal");
  expect(erp.reverseJournal.mock.calls[0]?.[2]).toMatchObject({ expected_version: 1 });
  expect(routing.replace).toHaveBeenCalledWith(erpPath("7", "journals", 9));
  await posted.close();
});

it("shows posted ledger and record navigation", async () => {
  const detail = await render(createElement(ErpAccountDetail));
  await detail.press("Edit account"); await detail.press("Posted ledger"); await detail.press("Accounts");
  await detail.close();
  const ledger = await render(createElement(ErpLedger));
  expect(erp.ledger).toHaveBeenCalledWith("7", "2", 1, 3);
  await ledger.press("Next"); await ledger.press("Previous"); await ledger.press("Account");
  expect(ledger.container.textContent).toContain("debit 100");
  await ledger.close();
});

it("shows service errors, stale versions, invalid amounts, and guest boundaries", async () => {
  erp.accounts.mockRejectedValueOnce(new Error("Accounts unavailable"));
  const list = await render(createElement(ErpAccountsDirectory));
  expect(list.container.textContent).toContain("Accounts unavailable"); await list.press("Retry"); await list.close();
  erp.createJournal.mockRejectedValueOnce(new ApiError("Invalid", 422, "validation", { lines: ["Unbalanced"] }));
  const form = await render(createElement(ErpJournalForm, { organizationId: "7" }));
  await form.press("Create draft"); expect(form.container.textContent).toContain("Enter two account IDs");
  await form.fill("Debit account ID", "2"); await form.fill("Credit account ID", "6");
  await form.fill("Amount (minor units)", "1e2"); await form.press("Create draft");
  expect(form.container.textContent).toContain("positive integer");
  await form.fill("Amount (minor units)", "9007199254740992"); await form.press("Create draft");
  expect(form.container.textContent).toContain("positive integer");
  await form.fill("Amount (minor units)", "100"); await form.press("Create draft");
  expect(form.container.textContent).toContain("Unbalanced"); await form.close();
  erp.postJournal.mockRejectedValueOnce(new ApiError("Stale", 422, "validation", { expected_version: ["Version changed"] }));
  const detail = await render(createElement(ErpJournalDetail));
  await detail.press("Post journal"); expect(detail.container.textContent).toContain("Version changed");
  await detail.close();
  session.user = null;
  for (const component of [ErpAccountsDirectory, ErpJournalsDirectory, ErpAccountCreatePage,
    ErpAccountEditPage, ErpJournalCreatePage, ErpJournalEditPage, ErpAccountDetail, ErpJournalDetail, ErpLedger]) {
    const guest = await render(createElement(component));
    expect(guest.container.textContent).toContain("Sign in"); await guest.close();
  }
});

it("handles empty model choices, missing labels, empty pages, and directory failures", async () => {
  erp.accounts.mockResolvedValueOnce({ data: [], meta: { ...meta,
    options: { type: {} } } });
  const accounts = await render(createElement(ErpAccountsDirectory));
  expect(accounts.container.textContent).toContain("No accounts on this page");
  await accounts.press("Type:");
  expect(erp.accounts).toHaveBeenLastCalledWith("7", 1, "", 2);
  await accounts.close();
  erp.accounts.mockResolvedValueOnce({ data: [account], meta: { ...meta,
    options: { type: { revenue: "Revenue" } } } });
  const unknown = await render(createElement(ErpAccountsDirectory));
  await unknown.press("Type:");
  expect(unknown.container.textContent).toContain("Revenue");
  await unknown.close();
  erp.journals.mockResolvedValueOnce({ data: [], meta: { ...meta,
    options: { status: {} } } });
  const journals = await render(createElement(ErpJournalsDirectory));
  expect(journals.container.textContent).toContain("No journals on this page");
  await journals.press("Status:");
  expect(erp.journals).toHaveBeenLastCalledWith("7", 1, "", 2);
  await journals.close();
  erp.journals.mockResolvedValueOnce({ data: [journal], meta: { ...meta,
    options: { status: { posted: "Posted" } } } });
  const unknownStatus = await render(createElement(ErpJournalsDirectory));
  await unknownStatus.press("Status:");
  expect(unknownStatus.container.textContent).toContain("Posted");
  await unknownStatus.close();
  erp.journals.mockRejectedValueOnce(new Error("Journals unavailable"));
  const failed = await render(createElement(ErpJournalsDirectory));
  expect(failed.container.textContent).toContain("Journals unavailable");
  await failed.press("Retry"); await failed.close();
});

it("retries record and form errors, and shows immutable or unsupported journal edits", async () => {
  erp.account.mockRejectedValueOnce(new Error("Account unavailable"));
  const accountDetail = await render(createElement(ErpAccountDetail));
  await accountDetail.press("Retry"); await accountDetail.close();
  erp.account.mockResolvedValueOnce({ account, options: { type: {} } });
  const unknownType = await render(createElement(ErpAccountDetail));
  expect(unknownType.container.textContent).toContain("Type: Unavailable"); await unknownType.close();
  erp.account.mockRejectedValueOnce(new Error("Edit account unavailable"));
  const accountEdit = await render(createElement(ErpAccountEditPage));
  await accountEdit.press("Retry"); await accountEdit.close();
  erp.accounts.mockRejectedValueOnce(new Error("Options unavailable"));
  const accountCreate = await render(createElement(ErpAccountCreatePage));
  await accountCreate.press("Retry"); await accountCreate.close();
  erp.journal.mockRejectedValueOnce(new Error("Journal unavailable"));
  const detail = await render(createElement(ErpJournalDetail));
  await detail.press("Retry"); await detail.close();
  erp.journal.mockRejectedValueOnce(new Error("Edit journal unavailable"));
  const edit = await render(createElement(ErpJournalEditPage));
  await edit.press("Retry"); await edit.close();
  erp.journal.mockResolvedValue({ journal: { ...journal, status: "posted" }, options: journalOptions });
  const posted = await render(createElement(ErpJournalEditPage));
  expect(posted.container.textContent).toContain("immutable"); await posted.close();
  erp.journal.mockResolvedValue({ journal: { ...journal, lines: [...journal.lines, journal.lines[0]] },
    options: journalOptions });
  const multiline = await render(createElement(ErpJournalEditPage));
  expect(multiline.container.textContent).toContain("multiple lines"); await multiline.close();
  erp.journal.mockResolvedValue({ journal: { ...journal, status: "posted", reverses_journal_id: 2 },
    options: journalOptions });
  const reversal = await render(createElement(ErpJournalDetail));
  expect(reversal.container.textContent).toContain("Reversal of journal 2"); await reversal.close();
  erp.journal.mockResolvedValue({ journal: { ...journal, lines: [...journal.lines, journal.lines[0]] },
    options: journalOptions });
  const noEdit = await render(createElement(ErpJournalDetail));
  expect(noEdit.button("Edit draft")).toBeUndefined(); await noEdit.close();
});

it("keeps failed writes in the form and failed transitions on the journal", async () => {
  erp.updateAccount.mockRejectedValueOnce(new Error("Account save unavailable"));
  const accountForm = await render(createElement(ErpAccountForm, { organizationId: "7", initial: account,
    options: { revenue: "Revenue" } }));
  expect(accountForm.container.textContent).toContain("Unavailable");
  await accountForm.press("Save account");
  expect(accountForm.container.textContent).toContain("Account save unavailable"); await accountForm.close();
  const emptyTypes = await render(createElement(ErpAccountForm, { organizationId: "7", options: {} }));
  await emptyTypes.press("Type:"); await emptyTypes.close();
  erp.updateJournal.mockRejectedValueOnce(new Error("Journal save unavailable"));
  const journalForm = await render(createElement(ErpJournalForm, { organizationId: "7", initial: journal }));
  await journalForm.press("Save draft");
  expect(journalForm.container.textContent).toContain("Journal save unavailable"); await journalForm.close();
  erp.postJournal.mockRejectedValueOnce(new Error("Posting unavailable"));
  const detail = await render(createElement(ErpJournalDetail));
  await detail.press("Post journal");
  expect(detail.container.textContent).toContain("Posting unavailable"); await detail.close();
  erp.journal.mockResolvedValue({ journal: { ...journal, status: "posted" }, options: journalOptions });
  erp.reverseJournal.mockRejectedValueOnce(new Error("Reversal unavailable"));
  const posted = await render(createElement(ErpJournalDetail));
  await posted.press("Reverse journal");
  expect(posted.container.textContent).toContain("Reversal unavailable"); await posted.close();
});

it("supports empty and failing ledger pages and a missing account selection", async () => {
  erp.ledger.mockResolvedValueOnce({ data: [], meta });
  const empty = await render(createElement(ErpLedger));
  expect(empty.container.textContent).toContain("No posted lines"); await empty.close();
  erp.ledger.mockRejectedValueOnce(new Error("Ledger unavailable"));
  const failed = await render(createElement(ErpLedger));
  expect(failed.container.textContent).toContain("Ledger unavailable");
  await failed.press("Retry"); await failed.close();
  routing.params.accountId = "";
  const missing = await render(createElement(ErpLedger));
  expect(missing.container.textContent).toContain("Choose an account"); await missing.close();
  routing.params.accountId = "2";
});

it("keeps filters safe while their first request is pending and reports labels removed by a refresh", async () => {
  let finishAccounts!: (value: Awaited<ReturnType<typeof erp.accounts>>) => void;
  let finishJournals!: (value: Awaited<ReturnType<typeof erp.journals>>) => void;
  erp.accounts.mockImplementationOnce(() => new Promise(resolve => { finishAccounts = resolve; }));
  erp.journals.mockImplementationOnce(() => new Promise(resolve => { finishJournals = resolve; }));
  function Filters() {
    const a = useErpAccounts("7");
    const j = useErpJournals("7");
    return createElement("div", {},
      createElement("button", { onClick: a.cycleType }, "Account filter"),
      createElement("button", { onClick: j.cycleStatus }, "Journal filter"));
  }
  const pending = await render(createElement(Filters));
  await pending.press("Account filter"); await pending.press("Journal filter");
  await act(async () => {
    finishAccounts({ data: [], meta: { ...meta, options: accountOptions } });
    finishJournals({ data: [], meta: { ...meta, options: journalOptions } });
  });
  await pending.close();

  erp.accounts.mockResolvedValueOnce({ data: [account], meta: { ...meta, options: accountOptions } });
  erp.accounts.mockResolvedValueOnce({ data: [account], meta: { ...meta, options: { type: {} } } });
  const accounts = await render(createElement(ErpAccountsDirectory));
  await accounts.press("Type:");
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(accounts.container.textContent).toContain("Unavailable");
  await accounts.close();
  erp.journals.mockResolvedValueOnce({ data: [journal], meta: { ...meta, options: journalOptions } });
  erp.journals.mockResolvedValueOnce({ data: [journal], meta: { ...meta, options: { status: {} } } });
  const journals = await render(createElement(ErpJournalsDirectory));
  await journals.press("Status:");
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(journals.container.textContent).toContain("Unavailable");
  await journals.close();
});
