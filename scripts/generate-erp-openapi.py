"""Write the isolated ERP general-ledger OpenAPI fragments and registry entries."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
BASE = "/api/v1/platform/organizations/{organization_id}/erp"
ID = {"type": "integer", "minimum": 1}
VERSION = {"type": "integer", "minimum": 0}
AMOUNT = {"type": "integer", "minimum": 0, "maximum": 9000000000000000}
DATE = {"type": "string", "format": "date", "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"}
STATUS = {"enum": ["draft", "posted"]}
TYPES = {"enum": ["asset", "liability", "equity", "revenue", "expense"]}


def obj(properties, required=None):
    return {"type": "object", "additionalProperties": False, "properties": properties,
            "required": required or list(properties)}


LINE_INPUT = obj({"account_id": ID, "debit_minor": AMOUNT, "credit_minor": AMOUNT})
LINES = {"type": "array", "minItems": 2, "maxItems": 100, "items": LINE_INPUT,
         "description": "Exactly one positive side per line; debit and credit totals must match and stay at or below 9e15."}
ACCOUNT_INPUT = obj({"code": {"type": "string", "minLength": 2, "maxLength": 40,
                               "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$"},
                     "name": {"type": "string", "minLength": 1, "maxLength": 200}, "type": TYPES})
ACCOUNT_UPDATE = obj({"name": ACCOUNT_INPUT["properties"]["name"], "expected_version": VERSION})
JOURNAL_INPUT = obj({"effective_date": DATE, "description": {"type": "string", "minLength": 1, "maxLength": 500},
                     "currency": {"type": "string", "pattern": "^[A-Z]{3}$"}, "lines": LINES})
JOURNAL_UPDATE = obj({**JOURNAL_INPUT["properties"], "expected_version": VERSION})
POST = obj({"expected_version": VERSION})
REVERSE = obj({"expected_version": VERSION, "effective_date": DATE})
ACCOUNT = obj({"id": ID, "code": {"type": "string"}, "name": {"type": "string"},
               "type": TYPES, "version": VERSION})
JOURNAL_LINE = obj({"id": ID, "position": ID, "account_id": ID,
                    "debit_minor": AMOUNT, "credit_minor": AMOUNT})
JOURNAL_SUMMARY = {"type": "object", "additionalProperties": False,
                   "required": ["id", "effective_date", "description", "currency", "status", "version",
                                "total_minor", "posted_at", "reverses_journal_id"],
                   "properties": {"id": ID, "effective_date": DATE, "description": {"type": "string"},
                                  "currency": {"type": "string", "pattern": "^[A-Z]{3}$"}, "status": STATUS,
                                  "version": VERSION, "total_minor": AMOUNT,
                                  "posted_at": {"type": "string", "format": "date-time", "nullable": True},
                                  "reverses_journal_id": {"type": "integer", "minimum": 1, "nullable": True}}}
JOURNAL = obj({**JOURNAL_SUMMARY["properties"], "lines": {"type": "array", "items": JOURNAL_LINE}})
PAGINATION = {"current_page": ID, "per_page": ID, "last_page": ID,
              "total": {"type": "integer", "minimum": 0}}
ACCOUNT_OPTIONS = obj({"type": {"type": "object", "additionalProperties": {"type": "string"}}})
JOURNAL_OPTIONS = obj({"status": {"type": "object", "additionalProperties": {"type": "string"}}})


def detail(key, row, options):
    return obj({key: row, "options": options})


def listing(row, options=None):
    meta = dict(PAGINATION)
    if options is not None:
        meta["options"] = options
    return obj({"data": {"type": "array", "items": row}, "meta": obj(meta)})


ACCOUNT_DETAIL = detail("account", ACCOUNT, ACCOUNT_OPTIONS)
JOURNAL_DETAIL = detail("journal", JOURNAL, JOURNAL_OPTIONS)
LEDGER_LINE = obj({"id": ID, "journal_id": ID, "account_id": ID,
                   "debit_minor": AMOUNT, "credit_minor": AMOUNT})


def parameter(name, location, schema):
    return {"name": name, "in": location, "required": True, "schema": schema}


def operation(name, description, completed, *, item=False, query=(), body=None):
    params = [parameter("organization_id", "path", ID)]
    if item:
        params.append(parameter("id", "path", ID))
    params.extend({"name": field, "in": "query", "schema": schema} for field, schema in query)
    params.extend([parameter("Idempotency-Key", "header", {"type": "string", "format": "uuid"}),
                   parameter("X-Operation-Token", "header", {"type": "string", "pattern": "^[a-f0-9]{64}$"})])
    result = {"operationId": name, "description": description, "parameters": params,
              "security": [{"bearerAuth": []}],
              "responses": {"202": {"description": "Committed ERP operation; poll its private receipt.",
                                    "content": {"application/json": {"schema": {"$ref": "../openapi.json#/components/schemas/Accepted"}}}},
                            "401": {"description": "Authentication required"},
                            "403": {"description": "Current membership or ERP entitlement denied"},
                            "404": {"description": "ERP record unavailable in this organization"},
                            "409": {"description": "Version or journal workflow conflict"},
                            "422": {"description": "validation_error field map"},
                            "504": {"description": "Remote ERP command deadline exceeded"}},
              "x-completed-result": completed}
    if body is not None:
        result["requestBody"] = {"required": True, "content": {"application/json": {"schema": body}}}
    return result


PAGE_QUERY = (("page", {"type": "integer", "minimum": 1, "maximum": 1000000}),
              ("per_page", {"type": "integer", "minimum": 1, "maximum": 50}))
FRAGMENTS = {
    "path-erp-accounts.json": {
        "get": operation("erpAccounts", "List organization chart accounts with indexed type filter.",
                         listing(ACCOUNT, ACCOUNT_OPTIONS), query=(*PAGE_QUERY, ("type", TYPES))),
        "post": operation("erpCreateAccount", "Owner: create a uniquely coded account.", ACCOUNT_DETAIL, body=ACCOUNT_INPUT),
    },
    "path-erp-accounts-id.json": {
        "get": operation("erpAccount", "View one organization chart account.", ACCOUNT_DETAIL, item=True),
        "patch": operation("erpUpdateAccount", "Owner: rename an account using expected version.", ACCOUNT_DETAIL,
                           item=True, body=ACCOUNT_UPDATE),
    },
    "path-erp-journals.json": {
        "get": operation("erpJournals", "List organization journals with indexed status filter.",
                         listing(JOURNAL_SUMMARY, JOURNAL_OPTIONS), query=(*PAGE_QUERY, ("status", STATUS))),
        "post": operation("erpCreateJournal", "Owner: create a balanced draft with integer minor-unit lines.",
                          JOURNAL_DETAIL, body=JOURNAL_INPUT),
    },
    "path-erp-journals-id.json": {
        "get": operation("erpJournal", "View one organization journal and ordered lines.", JOURNAL_DETAIL, item=True),
        "patch": operation("erpUpdateJournal", "Owner: replace a draft journal using expected version.",
                           JOURNAL_DETAIL, item=True, body=JOURNAL_UPDATE),
    },
    "path-erp-journals-id-post.json": {
        "post": operation("erpPostJournal", "Owner: post a balanced non-future draft immutably.",
                          JOURNAL_DETAIL, item=True, body=POST),
    },
    "path-erp-journals-id-reverse.json": {
        "post": operation("erpReverseJournal", "Owner: post one opposite-side reversal without editing the original.",
                          JOURNAL_DETAIL, item=True, body=REVERSE),
    },
    "path-erp-ledger.json": {
        "get": operation("erpLedger", "List posted ledger lines for one scoped chart account.",
                         listing(LEDGER_LINE), query=(*PAGE_QUERY, ("account_id", ID))),
    },
}

for filename, fragment in FRAGMENTS.items():
    (DOCS / "openapi" / filename).write_text(json.dumps(fragment, indent=2) + "\n", encoding="utf-8")

spec_path = DOCS / "openapi.json"
spec = json.loads(spec_path.read_text(encoding="utf-8"))
for suffix, filename in (("/accounts", "path-erp-accounts.json"),
                         ("/accounts/{id}", "path-erp-accounts-id.json"),
                         ("/journals", "path-erp-journals.json"),
                         ("/journals/{id}", "path-erp-journals-id.json"),
                         ("/journals/{id}/post", "path-erp-journals-id-post.json"),
                         ("/journals/{id}/reverse", "path-erp-journals-id-reverse.json"),
                         ("/ledger", "path-erp-ledger.json")):
    spec["paths"][BASE + suffix] = {"$ref": "./openapi/" + filename}
spec_path.write_text(json.dumps(spec, indent=2) + "\n", encoding="utf-8")

registry_path = DOCS / "registry.json"
registry = json.loads(registry_path.read_text(encoding="utf-8"))
for filename in FRAGMENTS:
    document_id = "openapi-" + filename.removesuffix(".json")
    if not any(item["id"] == document_id for item in registry["documents"]):
        registry["documents"].append({"id": document_id, "path": "docs/openapi/" + filename,
                                      "kind": "contract", "status": "active", "supersedes": []})
registry_path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
