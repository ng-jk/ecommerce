export { createClient } from "./services/commerce";
export { ApiError, money, errorMessage } from "./services/contracts";
export { createShopSlug } from "./services/contracts";
export type {
  ShopSlug,
  BuiltinShopSlug,
  Product,
  User,
  Address,
  CartInput,
  CartLine,
  Order,
  Page,
  StoragePort,
  FailureKind,
} from "./services/contracts";
export type * from "./services/assistant";
export { hostedPaymentUrlPattern } from "./services/payments";
export type { Organization, Membership } from "./services/platform_workspace";
export { createPlatformClient } from "./services/platform_identity";
export type {
  CrmCompany,
  CrmContact,
  CrmLead,
  CrmPipeline,
  CrmStage,
  CrmDeal,
  CrmActivity,
} from "./services/crm";
export type {
  HelpdeskQueue,
  HelpdeskAgent,
  HelpdeskRequesterTicket,
  HelpdeskStaffTicket,
  HelpdeskRequesterTicketSummary,
  HelpdeskStaffTicketSummary,
} from "./services/helpdesk";
export type {
  LearningCourse,
  LearningLesson,
  LearningAssessment,
} from "./services/learning";
export type { BuilderPage, BuilderBlock } from "./services/builder";
export type { ErpAccount, ErpJournal, ErpJournalLine } from "./services/erp";
export type {
  HrEmployee,
  HrAttendance,
  HrLeaveType,
  HrLeaveRequest,
} from "./services/hr";
export type {
  LendingProduct,
  LendingProductSummary,
  LendingApplication,
  LendingTermsSnapshot,
} from "./services/lending";
export type { SolutionOffering, SolutionPurchase } from "./services/solutions";

export type {
  InsightsKind,
  InsightColumn,
  InsightDefinition,
  InsightResource,
  InsightQueryResult,
} from "./services/insights";
