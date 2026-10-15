// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("../../frontend/admin/src/screens/platform_erp_screen", () => Object.fromEntries([
  "ErpHub", "ErpAccountsDirectory", "ErpAccountCreatePage", "ErpAccountDetail", "ErpAccountEditPage",
  "ErpJournalsDirectory", "ErpJournalCreatePage", "ErpJournalDetail", "ErpJournalEditPage", "ErpLedger",
].map(name => [name, () => createElement("span", {}, name)])));

import Hub from "../../frontend/admin/src/app/platform/organizations/[id]/erp";
import Accounts from "../../frontend/admin/src/app/platform/organizations/[id]/erp/accounts";
import AccountCreate from "../../frontend/admin/src/app/platform/organizations/[id]/erp/accounts/create";
import AccountDetail from "../../frontend/admin/src/app/platform/organizations/[id]/erp/accounts/[recordId]";
import AccountEdit from "../../frontend/admin/src/app/platform/organizations/[id]/erp/accounts/[recordId]/edit";
import Journals from "../../frontend/admin/src/app/platform/organizations/[id]/erp/journals";
import JournalCreate from "../../frontend/admin/src/app/platform/organizations/[id]/erp/journals/create";
import JournalDetail from "../../frontend/admin/src/app/platform/organizations/[id]/erp/journals/[recordId]";
import JournalEdit from "../../frontend/admin/src/app/platform/organizations/[id]/erp/journals/[recordId]/edit";
import Ledger from "../../frontend/admin/src/app/platform/organizations/[id]/erp/ledger";

it.each([
  [Hub, "ErpHub"], [Accounts, "ErpAccountsDirectory"],
  [AccountCreate, "ErpAccountCreatePage"], [AccountDetail, "ErpAccountDetail"],
  [AccountEdit, "ErpAccountEditPage"], [Journals, "ErpJournalsDirectory"],
  [JournalCreate, "ErpJournalCreatePage"], [JournalDetail, "ErpJournalDetail"],
  [JournalEdit, "ErpJournalEditPage"], [Ledger, "ErpLedger"],
] as const)("binds each ERP route to its intended page: %s", (Page, expected) => {
  expect(renderToStaticMarkup(createElement(Page))).toBe(`<span>${expected}</span>`);
});
