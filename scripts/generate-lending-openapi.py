"""Publish standalone Lending product, application, review, and schedule contracts."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OPENAPI = ROOT / "docs/openapi.json"
REGISTRY = ROOT / "docs/registry.json"
FRAGMENTS = ROOT / "docs/openapi"

POSITIVE = {"type": "integer", "minimum": 1}
VERSION = {"type": "integer", "minimum": 0}
TEXT = {"type": "string", "minLength": 1}
FIELD = {
    "code": {"type": "string", "pattern": "^[a-z][a-z0-9-]{0,59}$"},
    "name": {**TEXT, "maxLength": 200}, "jurisdiction_label": {**TEXT, "maxLength": 120},
    "terms_text": {**TEXT, "maxLength": 4000}, "currency": {"type": "string", "pattern": "^[A-Z]{3}$"},
    "minor_unit_digits": {"type": "integer", "minimum": 0, "maximum": 4},
    "principal_min_minor": {**POSITIVE, "maximum": 1000000000}, "principal_max_minor": {**POSITIVE, "maximum": 1000000000},
    "term_rate_numerator": {"type": "integer", "minimum": 0, "maximum": 1000000}, "term_rate_denominator": {**POSITIVE, "maximum": 1000000},
    "installment_count": {**POSITIVE, "maximum": 120}, "interval_days": {**POSITIVE, "maximum": 365},
    "status": {"type": "string", "enum": ["draft", "active", "disabled"]}, "expected_version": VERSION,
    "product_id": POSITIVE, "principal_minor": {**POSITIVE, "maximum": 1000000000}, "first_due_date": {"type": "string", "format": "date"},
    "purpose": {**TEXT, "maxLength": 2000}, "decision": {"type": "string", "enum": ["approved", "rejected"]},
    "decision_note": {**TEXT, "maxLength": 4000},
}
PRODUCT = ["name", "jurisdiction_label", "terms_text", "currency", "minor_unit_digits", "principal_min_minor", "principal_max_minor", "term_rate_numerator", "term_rate_denominator", "installment_count", "interval_days"]
APPLICATION = ["principal_minor", "first_due_date", "purpose"]
ROUTES = [
    ("products", "get", "lendingProducts", [], True),
    ("products", "post", "createLendingProduct", ["code", *PRODUCT], False),
    ("products/{id}", "get", "lendingProduct", [], False),
    ("products/{id}", "patch", "updateLendingProduct", [*PRODUCT, "status", "expected_version"], False),
    ("applications", "get", "lendingApplications", [], True),
    ("applications", "post", "createLendingApplication", ["product_id", *APPLICATION], False),
    ("applications/{id}", "get", "lendingApplication", [], False),
    ("applications/{id}", "patch", "updateLendingApplication", [*APPLICATION, "expected_version"], False),
    ("applications/{id}/submit", "post", "submitLendingApplication", ["expected_version"], False),
    ("applications/{id}/withdraw", "post", "withdrawLendingApplication", ["expected_version"], False),
    ("applications/{id}/schedule", "get", "lendingSchedule", [], False),
    ("reviews", "get", "lendingReviews", [], True),
    ("reviews/{id}", "get", "lendingReview", [], False),
    ("reviews/{id}/decide", "post", "decideLendingReview", ["expected_version", "decision", "decision_note"], False),
]


def operation(route, method, name, body, paged):
    params = [{"name": "organization_id", "in": "path", "required": True, "schema": POSITIVE}]
    if "{id}" in route:
        params.append({"name": "id", "in": "path", "required": True, "schema": POSITIVE})
    if paged:
        params.append({"name": "status", "in": "query", "schema": {"type": "string", "enum": ["draft", "active", "disabled"] if route == "products" else ["draft", "submitted", "approved", "rejected", "withdrawn"]}})
        params += [{"name": "page", "in": "query", "schema": {**POSITIVE, "maximum": 1000000}},
                   {"name": "per_page", "in": "query", "schema": {**POSITIVE, "maximum": 50}}]
    params += [{"name": "Idempotency-Key", "in": "header", "required": True, "schema": {"type": "string", "format": "uuid"}},
               {"name": "X-Operation-Token", "in": "header", "required": True, "schema": {"type": "string", "pattern": "^[a-f0-9]{64}$"}}]
    result = {"operationId": "standalone" + name[0].upper() + name[1:],
              "description": "Standalone Lending workflow using explicit operator jurisdiction labels and whole-term flat charge terms, not APR. Approval requires a distinct decision maker and a valid first due date. No compliance, disbursement, repayment or account balance is asserted. Submitted terms are immutable; exact integer allocation conserves principal and charges.",
              "parameters": params, "security": [{"bearerAuth": []}],
              "responses": {"202": {"description": "Durable command accepted; poll its private result receipt"},
                            "401": {"description": "Token unavailable or revoked"},
                            "403": {"description": "Current membership, role or entitlement denied"},
                            "404": {"description": "Record unavailable in this organization and visibility scope"},
                            "409": {"description": "Version conflict"},
                            "422": {"description": "Strict validation_error field map"},
                            "504": {"description": "Remote Lending command deadline exceeded"}}}
    if body:
        result["requestBody"] = {"required": True, "content": {"application/json": {"schema": {
            "type": "object", "additionalProperties": False, "required": body,
            "properties": {field: FIELD[field] for field in body}}}}}
    result["x-completed-result"] = {"description": "Versioned product/application with model-owned options, bounded data/meta page, or approved immutable schedule with integer principal_minor/charge_minor/total_minor and numbered due dates. Whole-term charge is rounded up once; each total is allocated by quotient and remainder."}
    return result


def generate():
    document = json.loads(OPENAPI.read_text(encoding="utf-8"))
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    for route, method, name, body, paged in ROUTES:
        path = f"/api/v1/platform/organizations/{{organization_id}}/lending/{route}"
        filename = "path-lending-" + route.replace("/{id}", "-id").replace("/", "-") + ".json"
        fragment = FRAGMENTS / filename
        existing = json.loads(fragment.read_text(encoding="utf-8")) if fragment.exists() else {}
        if method == "patch":
            existing.pop("put", None)
        existing[method] = operation(route, method, name, body, paged)
        fragment.write_text(json.dumps(existing, indent=2) + "\n", encoding="utf-8")
        document["paths"][path] = {"$ref": f"./openapi/{filename}"}
        doc_path = f"docs/openapi/{filename}"
        if not any(item["path"] == doc_path for item in registry["documents"]):
            registry["documents"].append({"id": filename.removesuffix(".json"), "path": doc_path,
                                          "kind": "contract", "status": "active", "supersedes": []})
    OPENAPI.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    REGISTRY.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    generate()
