"""Publish standalone HR employee, attendance, and leave command contracts."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OPENAPI = ROOT / "docs/openapi.json"
REGISTRY = ROOT / "docs/registry.json"
FRAGMENTS = ROOT / "docs/openapi"

POSITIVE = {"type": "integer", "minimum": 1}
VERSION = {"type": "integer", "minimum": 0}
FIELD = {
    "code": {"type": "string", "minLength": 3, "maxLength": 80, "pattern": "^[a-z][a-z0-9-]*$"},
    "display_name": {"type": "string", "minLength": 1, "maxLength": 200},
    "timezone": {"type": "string", "maxLength": 64, "description": "IANA timezone identifier"},
    "linked_platform_user_id": POSITIVE,
    "status": {"type": "string", "enum": ["active", "inactive", "terminated"]},
    "expected_version": VERSION,
    "started_at": {"type": "string", "format": "date-time", "description": "ISO 8601 timestamp with explicit UTC offset"},
    "ended_at": {"type": "string", "format": "date-time", "description": "ISO 8601 timestamp with explicit UTC offset"},
    "reason": {"type": "string", "minLength": 1, "maxLength": 2000},
    "allowance_days": {"type": "integer", "minimum": 0, "maximum": 366},
    "name": {"type": "string", "minLength": 1, "maxLength": 160},
    "leave_type_id": POSITIVE,
    "start_date": {"type": "string", "format": "date"},
    "end_date": {"type": "string", "format": "date"},
    "decision": {"type": "string", "enum": ["approved", "rejected"]},
}

ROUTES = [
    ("employees", "get", "hrEmployees", [], True, ["status"]),
    ("employees", "post", "hrCreateEmployee", ["code", "display_name", "timezone", "linked_platform_user_id"], False, []),
    ("owner/employees/{id}", "get", "hrOwnerEmployee", [], False, []),
    ("employees/me", "get", "hrMyEmployee", [], False, []),
    ("employees/{id}", "patch", "hrUpdateEmployee", ["display_name", "timezone", "status", "expected_version"], False, []),
    ("attendance", "get", "hrMyAttendance", [], True, ["local_date"]),
    ("attendance", "post", "hrRecordAttendance", ["started_at", "ended_at"], False, []),
    ("employees/{id}/attendance", "get", "hrOwnerAttendance", [], True, ["local_date"]),
    ("attendance/{id}/correct", "post", "hrCorrectAttendance", ["started_at", "ended_at", "reason", "expected_version"], False, []),
    ("leave-types", "get", "hrLeaveTypes", [], True, ["status"]),
    ("leave-types", "post", "hrCreateLeaveType", ["code", "name", "allowance_days"], False, []),
    ("leave", "get", "hrMyLeave", [], True, ["status"]),
    ("leave", "post", "hrRequestLeave", ["leave_type_id", "start_date", "end_date"], False, []),
    ("leave/{id}", "get", "hrMyLeaveDetail", [], False, []),
    ("owner/leave", "get", "hrOwnerLeave", [], True, ["status", "employee_id"]),
    ("owner/leave/{id}", "get", "hrOwnerLeaveDetail", [], False, []),
    ("owner/leave/{id}/decide", "post", "hrDecideLeave", ["decision", "expected_version"], False, []),
]


def operation(route, method, name, body, paged, filters):
    params = [{"name": "organization_id", "in": "path", "required": True, "schema": POSITIVE}]
    if "{id}" in route:
        params.append({"name": "id", "in": "path", "required": True, "schema": POSITIVE})
    if paged:
        params.extend([{"name": "page", "in": "query", "schema": {**POSITIVE, "maximum": 1000000}},
                       {"name": "per_page", "in": "query", "schema": {**POSITIVE, "maximum": 50}}])
    for field in filters:
        schema = (FIELD["status"] if field == "status" and route == "employees" else
                  {"type": "string", "enum": ["active", "retired"]} if field == "status" and route == "leave-types" else
                  {"type": "string", "enum": ["pending", "approved", "rejected"]} if field == "status" else
                  {"type": "string", "format": "date"} if field == "local_date" else POSITIVE)
        params.append({"name": field, "in": "query", "schema": schema})
    params.extend([{"name": "Idempotency-Key", "in": "header", "required": True,
                    "schema": {"type": "string", "format": "uuid"}},
                   {"name": "X-Operation-Token", "in": "header", "required": True,
                    "schema": {"type": "string", "pattern": "^[a-f0-9]{64}$"}}])
    result = {
        "operationId": "standalone" + name[0].upper() + name[1:],
        "description": "Standalone HR command. Current identity, membership, installation, entitlement and role are checked before the isolated effect. Attendance captures an interval, not proof of work; leave uses calendar days and makes no statutory or payroll claim.",
        "parameters": params, "security": [{"bearerAuth": []}],
        "responses": {"202": {"description": "Durable command accepted; poll its private result receipt"},
                      "401": {"description": "Token unavailable or revoked"},
                      "403": {"description": "Current membership, role or entitlement denied"},
                      "404": {"description": "HR record unavailable in this organization or to this employee"},
                      "409": {"description": "Version, overlap, allowance, or state conflict"},
                      "422": {"description": "Strict validation_error field map"},
                      "504": {"description": "Remote HR command deadline exceeded"}},
        "x-completed-result": {"description": "Scoped HR record or bounded data/meta page with server status options."},
    }
    if body:
        properties = {field: FIELD[field] for field in body}
        if name == "hrCreateLeaveType":
            properties["code"] = FIELD["code"]
        result["requestBody"] = {"required": True, "content": {"application/json": {"schema": {
            "type": "object", "additionalProperties": False, "required": body, "properties": properties}}}}
    return result


def generate():
    document = json.loads(OPENAPI.read_text(encoding="utf-8"))
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    for route, method, name, body, paged, filters in ROUTES:
        path = f"/api/v1/platform/organizations/{{organization_id}}/hr/{route}"
        filename = "path-hr-" + route.replace("/{id}", "-id").replace("/", "-") + ".json"
        fragment = FRAGMENTS / filename
        existing = json.loads(fragment.read_text(encoding="utf-8")) if fragment.exists() else {}
        existing[method] = operation(route, method, name, body, paged, filters)
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
