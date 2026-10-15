import type { z } from "zod";
import {
  crmId,
  crmPage,
  companiesList,
  contactsList,
  leadsList,
  companyDetail,
  contactDetail,
  leadDetail,
  convertedLead,
  createCompany,
  updateCompany,
  createContact,
  updateContact,
  createLead,
  updateLead,
  convertLead,
  pipelinesList,
  stagesList,
  dealsList,
  activitiesList,
  pipelineDetail,
  stageDetail,
  dealDetail,
  activityDetail,
  createPipeline,
  updatePipeline,
  createStage,
  updateStage,
  createDeal,
  updateDeal,
  advanceDeal,
  createActivity,
} from "../logic/contracts";

type Request = <T>(
  path: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  method?: string,
  body?: unknown,
) => Promise<T>;

export function createCrmClient(request: Request) {
  const base = (organizationId: string | number) =>
    `organizations/${crmId.parse(organizationId)}/crm`;
  const record = (
    organizationId: string | number,
    collection: string,
    recordId: string | number,
  ) => `${base(organizationId)}/${collection}/${crmId.parse(recordId)}`;
  const page = (value: number) => crmPage.parse(value);
  const companyFilter = (value: string) =>
    value ? `&company_id=${crmId.parse(value)}` : "";
  return {
    companies: (organizationId: string | number, currentPage = 1, code = "") =>
      request(
        `${base(organizationId)}/companies?page=${page(currentPage)}${code ? `&code=${encodeURIComponent(code.trim())}` : ""}`,
        companiesList,
      ),
    company: (organizationId: string | number, id: string | number) =>
      request(record(organizationId, "companies", id), companyDetail),
    createCompany: (
      organizationId: string | number,
      input: z.input<typeof createCompany>,
    ) =>
      request(
        `${base(organizationId)}/companies`,
        companyDetail,
        "POST",
        createCompany.parse(input),
      ),
    updateCompany: (
      organizationId: string | number,
      id: string | number,
      input: z.input<typeof updateCompany>,
    ) =>
      request(
        record(organizationId, "companies", id),
        companyDetail,
        "PATCH",
        updateCompany.parse(input),
      ),
    contacts: (
      organizationId: string | number,
      currentPage = 1,
      companyId = "",
    ) =>
      request(
        `${base(organizationId)}/contacts?page=${page(currentPage)}${companyFilter(companyId)}`,
        contactsList,
      ),
    contact: (organizationId: string | number, id: string | number) =>
      request(record(organizationId, "contacts", id), contactDetail),
    createContact: (
      organizationId: string | number,
      input: z.input<typeof createContact>,
    ) =>
      request(
        `${base(organizationId)}/contacts`,
        contactDetail,
        "POST",
        createContact.parse(input),
      ),
    updateContact: (
      organizationId: string | number,
      id: string | number,
      input: z.input<typeof updateContact>,
    ) =>
      request(
        record(organizationId, "contacts", id),
        contactDetail,
        "PATCH",
        updateContact.parse(input),
      ),
    leads: (
      organizationId: string | number,
      currentPage = 1,
      status = "",
      companyId = "",
    ) =>
      request(
        `${base(organizationId)}/leads?page=${page(currentPage)}${status ? `&status=${encodeURIComponent(status)}` : ""}${companyFilter(companyId)}`,
        leadsList,
      ),
    lead: (organizationId: string | number, id: string | number) =>
      request(record(organizationId, "leads", id), leadDetail),
    createLead: (
      organizationId: string | number,
      input: z.input<typeof createLead>,
    ) =>
      request(
        `${base(organizationId)}/leads`,
        leadDetail,
        "POST",
        createLead.parse(input),
      ),
    updateLead: (
      organizationId: string | number,
      id: string | number,
      input: z.input<typeof updateLead>,
    ) =>
      request(
        record(organizationId, "leads", id),
        leadDetail,
        "PATCH",
        updateLead.parse(input),
      ),
    convertLead: (
      organizationId: string | number,
      id: string | number,
      input: z.input<typeof convertLead>,
    ) =>
      request(
        `${record(organizationId, "leads", id)}/convert`,
        convertedLead,
        "POST",
        convertLead.parse(input),
      ),
    pipelines: (organizationId: string | number, currentPage = 1, code = "") =>
      request(
        `${base(organizationId)}/pipelines?page=${page(currentPage)}${code ? `&code=${encodeURIComponent(code.trim())}` : ""}`,
        pipelinesList,
      ),
    pipeline: (organizationId: string | number, id: string | number) =>
      request(record(organizationId, "pipelines", id), pipelineDetail),
    createPipeline: (
      organizationId: string | number,
      input: z.input<typeof createPipeline>,
    ) =>
      request(
        `${base(organizationId)}/pipelines`,
        pipelineDetail,
        "POST",
        createPipeline.parse(input),
      ),
    updatePipeline: (
      organizationId: string | number,
      id: string | number,
      input: z.input<typeof updatePipeline>,
    ) =>
      request(
        record(organizationId, "pipelines", id),
        pipelineDetail,
        "PATCH",
        updatePipeline.parse(input),
      ),
    stages: (
      organizationId: string | number,
      pipelineId: string | number,
      currentPage = 1,
      outcome = "",
    ) =>
      request(
        `${base(organizationId)}/stages?pipeline_id=${crmId.parse(pipelineId)}&page=${page(currentPage)}${outcome ? `&outcome=${encodeURIComponent(outcome)}` : ""}`,
        stagesList,
      ),
    stage: (organizationId: string | number, id: string | number) =>
      request(record(organizationId, "stages", id), stageDetail),
    createStage: (
      organizationId: string | number,
      input: z.input<typeof createStage>,
    ) =>
      request(
        `${base(organizationId)}/stages`,
        stageDetail,
        "POST",
        createStage.parse(input),
      ),
    updateStage: (
      organizationId: string | number,
      id: string | number,
      input: z.input<typeof updateStage>,
    ) =>
      request(
        record(organizationId, "stages", id),
        stageDetail,
        "PATCH",
        updateStage.parse(input),
      ),
    deals: (
      organizationId: string | number,
      currentPage = 1,
      pipelineId = "",
      status = "",
    ) =>
      request(
        `${base(organizationId)}/deals?page=${page(currentPage)}${pipelineId ? `&pipeline_id=${crmId.parse(pipelineId)}` : ""}${status ? `&status=${encodeURIComponent(status)}` : ""}`,
        dealsList,
      ),
    deal: (organizationId: string | number, id: string | number) =>
      request(record(organizationId, "deals", id), dealDetail),
    createDeal: (
      organizationId: string | number,
      input: z.input<typeof createDeal>,
    ) =>
      request(
        `${base(organizationId)}/deals`,
        dealDetail,
        "POST",
        createDeal.parse(input),
      ),
    updateDeal: (
      organizationId: string | number,
      id: string | number,
      input: z.input<typeof updateDeal>,
    ) =>
      request(
        record(organizationId, "deals", id),
        dealDetail,
        "PATCH",
        updateDeal.parse(input),
      ),
    advanceDeal: (
      organizationId: string | number,
      id: string | number,
      input: z.input<typeof advanceDeal>,
    ) =>
      request(
        `${record(organizationId, "deals", id)}/advance`,
        dealDetail,
        "POST",
        advanceDeal.parse(input),
      ),
    activities: (
      organizationId: string | number,
      currentPage = 1,
      dealId = "",
      type = "",
    ) =>
      request(
        `${base(organizationId)}/activities?page=${page(currentPage)}${dealId ? `&deal_id=${crmId.parse(dealId)}` : ""}${type ? `&type=${encodeURIComponent(type)}` : ""}`,
        activitiesList,
      ),
    activity: (organizationId: string | number, id: string | number) =>
      request(record(organizationId, "activities", id), activityDetail),
    createActivity: (
      organizationId: string | number,
      input: z.input<typeof createActivity>,
    ) =>
      request(
        `${base(organizationId)}/activities`,
        activityDetail,
        "POST",
        createActivity.parse(input),
      ),
  };
}
