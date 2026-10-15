// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.mock("../../frontend/admin/src/screens/platform_crm_screen", () => ({
  CrmDirectory: ({kind}: {kind:string}) => createElement("span", {}, `${kind}:list`),
  CrmCreatePage: ({kind}: {kind:string}) => createElement("span", {}, `${kind}:create`),
  CrmRecordPage: ({kind}: {kind:string}) => createElement("span", {}, `${kind}:detail`),
  CrmEditPage: ({kind}: {kind:string}) => createElement("span", {}, `${kind}:edit`),
}));
import CompanyList from "../../frontend/admin/src/app/platform/organizations/[id]/crm/companies";
import CompanyCreate from "../../frontend/admin/src/app/platform/organizations/[id]/crm/companies/create";
import CompanyDetail from "../../frontend/admin/src/app/platform/organizations/[id]/crm/companies/[recordId]";
import CompanyEdit from "../../frontend/admin/src/app/platform/organizations/[id]/crm/companies/[recordId]/edit";
import ContactList from "../../frontend/admin/src/app/platform/organizations/[id]/crm/contacts";
import ContactCreate from "../../frontend/admin/src/app/platform/organizations/[id]/crm/contacts/create";
import ContactDetail from "../../frontend/admin/src/app/platform/organizations/[id]/crm/contacts/[recordId]";
import ContactEdit from "../../frontend/admin/src/app/platform/organizations/[id]/crm/contacts/[recordId]/edit";
import LeadList from "../../frontend/admin/src/app/platform/organizations/[id]/crm/leads";
import LeadCreate from "../../frontend/admin/src/app/platform/organizations/[id]/crm/leads/create";
import LeadDetail from "../../frontend/admin/src/app/platform/organizations/[id]/crm/leads/[recordId]";
import LeadEdit from "../../frontend/admin/src/app/platform/organizations/[id]/crm/leads/[recordId]/edit";

it.each([
  [CompanyList,"companies:list"],[CompanyCreate,"companies:create"],[CompanyDetail,"companies:detail"],[CompanyEdit,"companies:edit"],
  [ContactList,"contacts:list"],[ContactCreate,"contacts:create"],[ContactDetail,"contacts:detail"],[ContactEdit,"contacts:edit"],
  [LeadList,"leads:list"],[LeadCreate,"leads:create"],[LeadDetail,"leads:detail"],[LeadEdit,"leads:edit"],
] as const)("wires the public route to its correct resource and mode: %s", async(Page,expected)=>{
  const container=document.createElement("div");const root=createRoot(container);
  await act(async()=>root.render(createElement(Page)));
  expect(container.textContent).toBe(expected);
  await act(async()=>root.unmount());
});
