"""Generate the backend tool catalog from the versioned OpenAPI contract."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACTION = {
    "solutionOfferings": ("solutions.offerings", "List published solution offering versions"),
    "solutionOffering": ("solutions.offering", "Read a published solution offering and deliverables"),
    "publishSolutionOffering": ("admin.solution.publish", "Admin: publish a priced solution offering version"),
    "solutionPurchases": ("platform.solution.purchases", "List organization solution purchases"),
    "solutionPurchase": ("platform.solution.purchase", "Read settlement and provisioning status"),
    "bindSolutionPurchase": ("platform.solution.bind", "Bind my owned shop order to an organization I own"),
    "retrySolutionPurchase": ("platform.solution.retry", "Owner: retry failed solution provisioning"),
    "lendingProducts": ("lending.products.list", "List configured Lending products"),
    "createLendingProduct": ("lending.products.create", "Create a draft Lending product with explicit operator terms"),
    "lendingProduct": ("lending.products.detail", "Read configured product terms"),
    "updateLendingProduct": ("lending.products.update", "Update a product using its current version"),
    "lendingApplications": ("lending.applications.list", "List my Lending applications"),
    "createLendingApplication": ("lending.applications.create", "Create my draft Lending application"),
    "lendingApplication": ("lending.applications.detail", "Read my Lending application"),
    "updateLendingApplication": ("lending.applications.update", "Update my draft application using its version"),
    "submitLendingApplication": ("lending.applications.submit", "Submit and freeze current product terms"),
    "withdrawLendingApplication": ("lending.applications.withdraw", "Withdraw my nonterminal application"),
    "lendingSchedule": ("lending.applications.schedule", "Read my approved fixed-day schedule; no payment or balance recorded"),
    "lendingReviews": ("lending.reviews.list", "Admin: list applications for review"),
    "lendingReview": ("lending.reviews.detail", "Admin: review an application"),
    "decideLendingReview": ("lending.reviews.decide", "Admin: decide another applicant’s submitted application with evidence"),

    "hrEmployees": ("hr.employees.list", "Owner: list organization employees with indexed status filter"),
    "hrCreateEmployee": ("hr.employees.create", "Owner: link a current organization platform member to an employee"),
    "hrOwnerEmployee": ("hr.employees.owner.detail", "Owner: view one organization employee"),
    "hrMyEmployee": ("hr.employees.mine.detail", "View my active employee profile"),
    "hrUpdateEmployee": ("hr.employees.update", "Owner: update an employee using expected version"),
    "hrMyAttendance": ("hr.attendance.mine.list", "List my bounded attendance intervals"),
    "hrRecordAttendance": ("hr.attendance.record", "Record my bounded interval with an explicit UTC offset"),
    "hrOwnerAttendance": ("hr.attendance.owner.list", "Owner: list one employee's attendance"),
    "hrCorrectAttendance": ("hr.attendance.owner.correct", "Owner: append an audited attendance correction"),
    "hrLeaveTypes": ("hr.leave.types.list", "List current organization leave types and allowances"),
    "hrCreateLeaveType": ("hr.leave.types.create", "Owner: create a uniquely coded leave type"),
    "hrMyLeave": ("hr.leave.mine.list", "List my leave requests"),
    "hrRequestLeave": ("hr.leave.mine.create", "Request leave within my allowance using calendar dates"),
    "hrMyLeaveDetail": ("hr.leave.mine.detail", "View my leave request"),
    "hrOwnerLeave": ("hr.leave.owner.list", "Owner: list organization leave requests"),
    "hrOwnerLeaveDetail": ("hr.leave.owner.detail", "Owner: view one organization leave request"),
    "hrDecideLeave": ("hr.leave.owner.decide", "Owner: approve or reject another employee's leave using expected version"),
    "erpAccounts": ("erp.accounts.list", "List organization chart accounts with indexed type filter"),
    "erpCreateAccount": ("erp.accounts.create", "Owner: create a uniquely coded chart account"),
    "erpAccount": ("erp.accounts.detail", "View an organization chart account"),
    "erpUpdateAccount": ("erp.accounts.update", "Owner: rename an account using expected version"),
    "erpJournals": ("erp.journals.list", "List organization journals with indexed status filter"),
    "erpCreateJournal": ("erp.journals.create", "Owner: create a balanced draft journal"),
    "erpJournal": ("erp.journals.detail", "View a journal and ordered lines"),
    "erpUpdateJournal": ("erp.journals.update", "Owner: replace a draft journal using expected version"),
    "erpPostJournal": ("erp.journals.post", "Owner: post a balanced non-future draft immutably"),
    "erpReverseJournal": ("erp.journals.reverse", "Owner: post one opposite-side journal reversal"),
    "erpLedger": ("erp.ledger.list", "List posted ledger lines for one scoped account"),
    "insightsDatasets": ("insights.datasets.list", "Authorized Insights datasets.list"),
    "insightsCreateDataset": ("insights.datasets.create", "Authorized Insights datasets.create"),
    "insightsDataset": ("insights.datasets.detail", "Authorized Insights datasets.detail"),
    "insightsUpdateDataset": ("insights.datasets.update", "Authorized Insights datasets.update"),
    "insightsReplaceRows": ("insights.datasets.replace", "Authorized Insights datasets.replace"),
    "insightsQuery": ("insights.datasets.query", "Authorized Insights datasets.query"),
    "insightsReports": ("insights.reports.list", "Authorized Insights reports.list"),
    "insightsCreateReport": ("insights.reports.create", "Authorized Insights reports.create"),
    "insightsReport": ("insights.reports.detail", "Authorized Insights reports.detail"),
    "insightsUpdateReport": ("insights.reports.update", "Authorized Insights reports.update"),
    "insightsRunReport": ("insights.reports.run", "Authorized Insights reports.run"),
    "insightsDashboards": ("insights.dashboards.list", "Authorized Insights dashboards.list"),
    "insightsCreateDashboard": ("insights.dashboards.create", "Authorized Insights dashboards.create"),
    "insightsDashboard": ("insights.dashboards.detail", "Authorized Insights dashboards.detail"),
    "insightsUpdateDashboard": ("insights.dashboards.update", "Authorized Insights dashboards.update"),
    "insightsRenderDashboard": ("insights.dashboards.render", "Authorized Insights dashboards.render"),
    "learningAuthorCourses": ("learning.courses.author.list", "Owner: list authored organization courses"),
    "learningCreateCourse": ("learning.courses.create", "Owner: create a draft Learning course"),
    "learningAuthorCourse": ("learning.courses.author.detail", "Owner: view draft course and bounded content lists"),
    "learningUpdateCourse": ("learning.courses.update", "Owner: update a draft course with expected version"),
    "learningPublishCourse": ("learning.courses.publish", "Owner: publish a complete draft course"),
    "learningArchiveCourse": ("learning.courses.archive", "Owner: archive a course with expected version"),
    "learningAuthorLesson": ("learning.lessons.author.detail", "Owner: view authored lesson"),
    "learningAuthorAssessment": ("learning.assessments.author.detail", "Owner: view assessment answer key"),
    "learningCreateLesson": ("learning.lessons.create", "Owner: add lesson to draft course"),
    "learningUpdateLesson": ("learning.lessons.update", "Owner: update draft lesson"),
    "learningCreateAssessment": ("learning.assessments.create", "Owner: add assessment to draft course"),
    "learningUpdateAssessment": ("learning.assessments.update", "Owner: update draft assessment"),
    "learningCourses": ("learning.courses.list", "List published courses in organization"),
    "learningCourse": ("learning.courses.detail", "View enrolled published course and bounded content lists"),
    "learningEnroll": ("learning.enrollments.create", "Enroll current account in an available course"),
    "learningEnrollments": ("learning.enrollments.list", "List my Learning enrollments"),
    "learningEnrollment": ("learning.enrollments.detail", "View my derived lesson delivery and assessment progress"),
    "learningReadLesson": ("learning.lessons.read", "Read an enrolled lesson and record delivery"),
    "learningAssessment": ("learning.assessments.detail", "View enrolled assessment without answer key"),
    "learningSubmitAttempt": ("learning.attempts.submit", "Submit assessment answers for server scoring"),
    "learningAttempts": ("learning.attempts.list", "List my assessment attempts"),
    "builderPages": ("builder.pages.list", "List organization Builder pages with indexed status filter"),
    "builderCreatePage": ("builder.pages.create", "Owner: create a declarative Builder draft"),
    "builderPage": ("builder.pages.detail", "View one Builder page draft"),
    "builderUpdatePage": ("builder.pages.update", "Owner: update Builder draft using expected version"),
    "builderPublishPage": ("builder.pages.publish", "Owner: publish a Builder page snapshot using expected version"),
    "builderRenderPage": ("builder.pages.render", "Read the latest published Builder page snapshot"),
    "helpdeskQueues": ("helpdesk.queues.list", "List organization Helpdesk queues with indexed status filter"),
    "helpdeskCreateQueue": ("helpdesk.queues.create", "Owner: create an organization Helpdesk queue"),
    "helpdeskQueue": ("helpdesk.queues.detail", "View one organization Helpdesk queue"),
    "helpdeskUpdateQueue": ("helpdesk.queues.update", "Owner: update a Helpdesk queue with expected version"),
    "helpdeskAgents": ("helpdesk.agents.list", "Owner: list Helpdesk queue agents"),
    "helpdeskAssignAgent": ("helpdesk.agents.assign", "Owner: assign an active organization platform member to a queue"),
    "helpdeskRevokeAgent": ("helpdesk.agents.revoke", "Owner: revoke a queue agent with expected version"),
    "helpdeskRequesterTickets": ("helpdesk.tickets.requester.list", "List my Helpdesk tickets"),
    "helpdeskCreateRequesterTicket": ("helpdesk.tickets.requester.create", "Create my Helpdesk ticket in an active queue"),
    "helpdeskRequesterTicket": ("helpdesk.tickets.requester.detail", "View my Helpdesk ticket"),
    "helpdeskAgentTickets": ("helpdesk.tickets.agent.list", "List tickets in my active Helpdesk queues"),
    "helpdeskAgentTicket": ("helpdesk.tickets.agent.detail", "View a ticket in my active Helpdesk queue"),
    "helpdeskAgentTicketStatus": ("helpdesk.tickets.agent.status", "Agent: transition a queue ticket using expected version"),
    "helpdeskOwnerTickets": ("helpdesk.tickets.owner.list", "Owner: list organization Helpdesk tickets"),
    "helpdeskOwnerTicket": ("helpdesk.tickets.owner.detail", "Owner: view an organization Helpdesk ticket"),
    "helpdeskOwnerTicketAssign": ("helpdesk.tickets.owner.assign", "Owner: assign a ticket to an active queue agent"),
    "helpdeskOwnerTicketStatus": ("helpdesk.tickets.owner.status", "Owner: transition a ticket using expected version"),
    "applicationCatalog": ("platform.application.catalog", "List paginated application definitions and current entitlements for an organization"),
    "applicationInstall": ("platform.application.install", "Owner: install a provisioned application with a trusted current entitlement"),
    "applicationDisable": ("platform.application.disable", "Owner: disable a non-Framework application using its version"),
    "applicationReenable": ("platform.application.reenable", "Owner: re-enable a provisioned application with current entitlement"),
    "crmCompanies": ("crm.companies.list", "List organization CRM companies with indexed exact code filter"),
    "crmCreateCompany": ("crm.companies.create", "Create an organization CRM company with a unique code"),
    "crmCompany": ("crm.companies.detail", "View one organization CRM company"),
    "crmUpdateCompany": ("crm.companies.update", "Rename a CRM company with its expected version"),
    "crmContacts": ("crm.contacts.list", "List organization CRM contacts with indexed company filter"),
    "crmCreateContact": ("crm.contacts.create", "Create a CRM contact with unique normalized email"),
    "crmContact": ("crm.contacts.detail", "View one organization CRM contact"),
    "crmUpdateContact": ("crm.contacts.update", "Update a CRM contact with its expected version"),
    "crmLeads": ("crm.leads.list", "List organization CRM leads with indexed status and company filters"),
    "crmCreateLead": ("crm.leads.create", "Create a CRM lead without creating a login"),
    "crmLead": ("crm.leads.detail", "View one organization CRM lead and status options"),
    "crmUpdateLead": ("crm.leads.update", "Advance a CRM lead using its expected version"),
    "crmConvertLead": ("crm.leads.convert", "Convert a qualified CRM lead to one scoped contact"),
    "crmPipelines": ("crm.pipelines.list", "List organization CRM sales pipelines"),
    "crmCreatePipeline": ("crm.pipelines.create", "Create a CRM sales pipeline with a unique code"),
    "crmPipeline": ("crm.pipelines.detail", "View one CRM sales pipeline"),
    "crmUpdatePipeline": ("crm.pipelines.update", "Rename a CRM pipeline with expected version"),
    "crmStages": ("crm.stages.list", "List ordered stages for one CRM pipeline"),
    "crmCreateStage": ("crm.stages.create", "Create an ordered CRM pipeline stage"),
    "crmStage": ("crm.stages.detail", "View one CRM pipeline stage"),
    "crmUpdateStage": ("crm.stages.update", "Rename a CRM pipeline stage with expected version"),
    "crmDeals": ("crm.deals.list", "List scoped CRM deals with indexed pipeline and status filters"),
    "crmCreateDeal": ("crm.deals.create", "Create a CRM deal in an open pipeline stage"),
    "crmDeal": ("crm.deals.detail", "View one CRM deal"),
    "crmUpdateDeal": ("crm.deals.update", "Edit an open CRM deal with expected version"),
    "crmAdvanceDeal": ("crm.deals.advance", "Advance an open CRM deal to a later stage using expected version"),
    "crmActivities": ("crm.activities.list", "List scoped CRM deal activities"),
    "crmCreateActivity": ("crm.activities.create", "Append an activity to one CRM deal"),
    "crmActivity": ("crm.activities.detail", "View one CRM deal activity"),
    "memberships": ("platform.memberships", "List authorized organization memberships with indexed status and role filters"),
    "membership": ("platform.membership", "View an authorized organization membership or my invitation"),
    "inviteMembership": ("platform.membership.invite", "Owner: invite an existing shop account into this organization"),
    "changeMembershipRole": ("platform.membership.role", "Owner: change a membership role while protecting the last owner"),
    "revokeMembership": ("platform.membership.revoke", "Owner: revoke a membership while protecting the last owner"),
    "acceptMembership": ("platform.membership.accept", "Accept my organization invitation"),
    "organizations": ("platform.organizations", "List my organization workspaces with an optional indexed status filter"),
    "createOrganization": ("platform.organization.create", "Create an organization workspace with a unique code and become its owner"),
    "organization": ("platform.organization", "View an organization workspace that I belong to"),
    "updateOrganization": ("platform.organization.update", "Owner: rename an organization workspace by ID"),
    "organizationApplications": ("platform.applications", "List available installed applications in an organization workspace"),
    "miniapps": ("miniapps.list", "List enabled Mini Apps installed for this merchant"),
    "launchMiniapp": ("miniapps.launch", "Create a short-lived authorized Mini App launch"),
    "invokeMiniapp": ("miniapps.invoke", "Invoke an approved read capability through a current Mini App launch"),
    "adminMiniapps": ("admin.miniapps", "Administrator: list Mini App installations and approved packages"),
    "installMiniapp": ("admin.miniapp.install", "Administrator: install an approved Mini App version for this merchant"),
    "updateMiniapp": ("admin.miniapp.update", "Administrator: enable or disable a Mini App and change its capability grants"),
    "adminPlugins": ("admin.plugins", "Administrator: list this merchant's plugin installations"),
    "adminPlugin": ("admin.plugin", "Administrator: view this merchant's plugin configuration"),
    "installPlugin": ("admin.plugin.install", "Administrator: install an approved plugin for this merchant only"),
    "updatePlugin": ("admin.plugin.update", "Administrator: enable, disable or configure this merchant's plugin"),
    "loyaltyBalance": ("plugin.loyalty.balance", "Show my loyalty points for this merchant"),
    "creditLoyalty": ("admin.plugin.loyalty.credit", "Administrator: credit loyalty points to an active customer in this merchant"),
    "catalog": ("catalog", "Search or list products in the shop"),
    "product": ("product", "View one product by ID"),
    "login": ("auth.login", "Sign in using credentials supplied securely as data"),
    "register": ("auth.register", "Register a customer account"),
    "logout": ("auth.logout", "Sign out and revoke access"),
    "me": ("auth.me", "Show my current account"),
    "cart": ("cart.read", "Show my shopping cart"),
    "updateCart": (
        "cart.update",
        "Replace my cart with the complete items list; not an incremental addition",
    ),
    "checkout": (
        "checkout",
        "Place an order from my cart using the configured payment provider; then list orders for its secure payment link",
    ),
    "orders": ("orders", "List my orders, payment status, and secure payment links"),
    "adminProducts": ("admin.products", "Administrator: list inventory products"),
    "adminProduct": (
        "admin.product",
        "Administrator: view a product including inactive inventory",
    ),
    "createProduct": (
        "admin.create",
        "Administrator: create a product; price is integer MYR sen",
    ),
    "updateProduct": ("admin.update", "Administrator: edit a product by ID"),
    "deleteProduct": ("admin.delete", "Administrator: soft delete a product by ID"),
    "adminOrders": ("admin.orders", "Administrator: list shop orders and verified payment status"),
    "updateOrder": (
        "admin.advance",
        "Administrator: advance an order one status at a time",
    ),
    "operationStatus": (
        "operations.show",
        "Retrieve an operation using its private receipt",
    ),
    "billplzWebhook": ("payments.webhook", "Provider-only signed callback; cannot be invoked by the assistant"),
    "stripeWebhook": ("payments.stripe-webhook", "Stripe-only signed raw-body callback; cannot be invoked by the assistant"),
    "customPaymentConfirm": ("payments.custom-confirm", "Machine-only integration payment attestation; cannot be invoked by the assistant"),
    "customPaymentStatus": ("payments.custom-status", "Machine-only integration event status; cannot be invoked by the assistant"),
    "assistant": ("assistant", "Conversational API; cannot be called recursively"),
}


def resolve(value, path):
    if isinstance(value, list):
        return [resolve(item, path) for item in value]
    if not isinstance(value, dict):
        return value
    if "$ref" in value:
        file, _, pointer = value["$ref"].partition("#")
        target = (path.parent / file).resolve() if file else path
        document = json.loads(target.read_text(encoding="utf-8"))
        for key in pointer.strip("/").split("/") if pointer else []:
            document = document[key.replace("~1", "/").replace("~0", "~")]
        return resolve(document, target)
    return {key: resolve(item, path) for key, item in value.items()}


def generate():
    path = ROOT / "docs/openapi.json"
    document = json.loads(path.read_text())
    registry = []
    for route, reference in document["paths"].items():
        for method, operation in resolve(reference, path).items():
            name = operation.get("operationId", "operationStatus")
            if name.startswith("standalone"):
                canonical_name = name[len("standalone"):]
                canonical_name = canonical_name[0].lower() + canonical_name[1:]
                canonical_action, description = ACTION[canonical_name]
                action = "standalone." + canonical_action
            elif name.startswith("platform"):
                canonical_name = name[len("platform"):].lower()
                action, description = ("platform.auth." + canonical_name, "Shop-independent platform identity command")
                if name == "platformOperationStatus":
                    action = "platform.operations.show"
                elif name == "platformAssistant":
                    action = "platform.assistant"
            else:
                action, description = ACTION[name]
            schema = (
                operation.get("requestBody", {})
                .get("content", {})
                .get("application/json", {})
                .get("schema", {"type": "object", "properties": {}})
            )
            schema.setdefault("required", [])
            schema["additionalProperties"] = False
            for parameter in operation.get("parameters", []):
                if parameter["in"] in ("path", "query") and parameter["name"] != "shop":
                    schema["properties"][parameter["name"]] = parameter["schema"]
                    if parameter.get("required"):
                        schema["required"].append(parameter["name"])
            registry.append(
                {
                    "name": name,
                    "action": action,
                    "description": description,
                    "method": method.upper(),
                    "path": route,
                    "parameters": schema,
                    "role": "machine"
                    if operation.get("x-machine-only")
                    else (
                        "admin"
                        if action.startswith("admin.")
                        else ("user" if operation.get("security") else "public")
                    ),
                    "callable": name not in (
                        "platformOperationStatus",
                        "platformAssistant",
                        "assistant",
                        "operationStatus",
                        "billplzWebhook",
                        "stripeWebhook",
                        "customPaymentConfirm",
                        "customPaymentStatus",
                    ),
                    "confirmation": method != "get" and not operation.get("x-machine-only"),
                    "responses": operation["responses"],
                }
            )
    output = ROOT / "backend/resources/assistant-tools.json"
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    generate()
