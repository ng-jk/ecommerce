"""Publish Insights dataset, report and dashboard command contracts for standalone transport."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OPENAPI = ROOT / "docs/openapi.json"
REGISTRY = ROOT / "docs/registry.json"
FRAGMENTS = ROOT / "docs/openapi"

POSITIVE = {"type": "integer", "minimum": 1}
VERSION = {"type": "integer", "minimum": 0}
TEXT = {"type": "string", "minLength": 1}
COLUMN = {"type": "object", "additionalProperties": False, "required": ["name", "type"], "properties": {
    "name": {"type": "string", "pattern": "^[a-z][a-z0-9_]{0,39}$"},
    "type": {"type": "string", "enum": ["string", "integer", "boolean"]}}}
CELL = {"oneOf": [{"type": "string", "maxLength": 80}, {"type": "integer", "minimum": -1000000000, "maximum": 1000000000}, {"type": "boolean"}]}
DEFINITION = {"type": "object", "additionalProperties": False, "required": ["metric"], "properties": {
    "metric": {"type": "object", "additionalProperties": False, "required": ["aggregate"], "properties": {
        "aggregate": {"type": "string", "enum": ["count", "sum", "avg"]}, "column": {"type": "string", "maxLength": 40}}},
    "group_by": {"type": "string", "maxLength": 40}, "limit": {"type": "integer", "minimum": 1, "maximum": 50},
    "filters": {"type": "array", "maxItems": 5, "items": {"type": "object", "additionalProperties": False,
        "required": ["column", "operator", "value"], "properties": {"column": {"type": "string", "maxLength": 40},
        "operator": {"type": "string", "enum": ["eq", "gte", "lte"]}, "value": CELL}}}}}
FIELD = {"name": {**TEXT, "maxLength": 200}, "visibility": {"type": "string", "enum": ["private", "organization"]},
    "status": {"type": "string", "enum": ["active", "disabled"]}, "expected_version": VERSION,
    "schema": {"type": "array", "minItems": 1, "maxItems": 20, "items": COLUMN},
    "rows": {"type": "array", "maxItems": 500, "items": {"type": "object", "additionalProperties": CELL}},
    "definition": DEFINITION, "dataset_id": POSITIVE, "report_ids": {"type": "array", "minItems": 1, "maxItems": 6, "uniqueItems": True, "items": POSITIVE}}
ROUTES = [
    ("datasets", "get", "insightsDatasets", [], True),
    ("datasets", "post", "insightsCreateDataset", ["name", "visibility", "schema"], False),
    ("datasets/{id}", "get", "insightsDataset", [], False),
    ("datasets/{id}", "put", "insightsUpdateDataset", ["expected_version", "name", "visibility", "status"], False),
    ("datasets/{id}/rows", "post", "insightsReplaceRows", ["expected_version", "rows"], False),
    ("datasets/{id}/query", "post", "insightsQuery", ["definition"], False),
    ("reports", "get", "insightsReports", [], True),
    ("reports", "post", "insightsCreateReport", ["name", "visibility", "dataset_id", "definition"], False),
    ("reports/{id}", "get", "insightsReport", [], False),
    ("reports/{id}", "put", "insightsUpdateReport", ["expected_version", "name", "visibility", "status", "definition"], False),
    ("reports/{id}/run", "post", "insightsRunReport", [], False),
    ("dashboards", "get", "insightsDashboards", [], True),
    ("dashboards", "post", "insightsCreateDashboard", ["name", "visibility", "report_ids"], False),
    ("dashboards/{id}", "get", "insightsDashboard", [], False),
    ("dashboards/{id}", "put", "insightsUpdateDashboard", ["expected_version", "name", "visibility", "status", "report_ids"], False),
    ("dashboards/{id}/render", "post", "insightsRenderDashboard", [], False),
]


def operation(route, method, name, body, paged):
    params = [{"name": "organization_id", "in": "path", "required": True, "schema": POSITIVE}]
    if "{id}" in route:
        params.append({"name": "id", "in": "path", "required": True, "schema": POSITIVE})
    if paged:
        params += [{"name": "page", "in": "query", "schema": {**POSITIVE, "maximum": 1000000}},
                   {"name": "per_page", "in": "query", "schema": {**POSITIVE, "maximum": 50}}]
    params += [{"name": "Idempotency-Key", "in": "header", "required": True, "schema": {"type": "string", "format": "uuid"}},
               {"name": "X-Operation-Token", "in": "header", "required": True, "schema": {"type": "string", "pattern": "^[a-f0-9]{64}$"}}]
    result = {"operationId": "standalone" + name[0].upper() + name[1:],
              "description": "Standalone Insights command. Manual datasets use a bounded typed query language. No SQL or foreign database credentials are accepted. Current dataset access applies to reports and dashboards. Integer sums and exact rational averages avoid floating-point ambiguity.",
              "parameters": params, "security": [{"bearerAuth": []}],
              "responses": {"202": {"description": "Durable command accepted; poll its private result receipt"},
                            "401": {"description": "Token unavailable or revoked"},
                            "403": {"description": "Current membership, role or entitlement denied"},
                            "404": {"description": "Record unavailable in this organization and visibility scope"},
                            "409": {"description": "Version conflict"},
                            "422": {"description": "Strict validation_error field map"},
                            "504": {"description": "Remote Insights command deadline exceeded"}}}
    if body:
        result["requestBody"] = {"required": True, "content": {"application/json": {"schema": {
            "type": "object", "additionalProperties": False, "required": body,
            "properties": {field: FIELD[field] for field in body}}}}}
    result["x-completed-result"] = {"description": "Resource metadata, bounded data/meta page, or query data with dataset version and import timestamp. Average values are exact numerator/denominator objects."}
    return result


def generate():
    document = json.loads(OPENAPI.read_text(encoding="utf-8"))
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    for route, method, name, body, paged in ROUTES:
        path = f"/api/v1/platform/organizations/{{organization_id}}/insights/{route}"
        filename = "path-insights-" + route.replace("/{id}", "-id").replace("/", "-") + ".json"
        fragment = FRAGMENTS / filename
        existing = json.loads(fragment.read_text(encoding="utf-8")) if fragment.exists() else {}
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
