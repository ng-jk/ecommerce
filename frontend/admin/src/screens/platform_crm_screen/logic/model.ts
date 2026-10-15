import type { CrmCompany, CrmContact, CrmLead } from "@portfolio/api-client";

export type CrmKind = "companies" | "contacts" | "leads";
export type CrmRecord = CrmCompany | CrmContact | CrmLead;
export const crmLabel: Record<CrmKind, string> = {
  companies: "Companies",
  contacts: "Contacts",
  leads: "Leads",
};
export const crmSingular: Record<CrmKind, string> = {
  companies: "Company",
  contacts: "Contact",
  leads: "Lead",
};
export const crmPath = (
  organizationId: string,
  kind: CrmKind,
  recordId?: number | string,
) =>
  `/platform/organizations/${organizationId}/crm/${kind}${recordId === undefined ? "" : `/${recordId}`}`;
