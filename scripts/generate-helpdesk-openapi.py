"""Publish the Helpdesk HD01 command paths used by the standalone SDK and assistant registry."""

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
    "code": {"type": "string", "minLength": 3, "maxLength": 80, "pattern": "^[a-z][a-z0-9-]*$"},
    "name": {**TEXT, "maxLength": 160},
    "status": TEXT,
    "expected_version": VERSION,
    "queue_id": POSITIVE,
    "target_platform_user_id": POSITIVE,
    "assigned_platform_user_id": POSITIVE,
    "subject": {**TEXT, "maxLength": 200},
    "description": {**TEXT, "maxLength": 10000},
}

# A single operation map prevents paths, assistant names, and input contracts from drifting.
ROUTES = [
    ("queues", "get", "helpdeskQueues", [], ["status"], False),
    ("queues", "post", "helpdeskCreateQueue", ["code", "name"], [], False),
    ("queues/{id}", "get", "helpdeskQueue", [], [], True),
    ("queues/{id}", "patch", "helpdeskUpdateQueue", ["name", "status", "expected_version"], [], True),
    ("agents", "get", "helpdeskAgents", [], ["queue_id", "status"], False),
    ("agents", "post", "helpdeskAssignAgent", ["queue_id", "target_platform_user_id"], [], False),
    ("agents/{id}/revoke", "post", "helpdeskRevokeAgent", ["expected_version"], [], True),
    ("tickets", "get", "helpdeskRequesterTickets", [], ["queue_id", "status"], False),
    ("tickets", "post", "helpdeskCreateRequesterTicket", ["queue_id", "subject", "description"], [], False),
    ("tickets/{id}", "get", "helpdeskRequesterTicket", [], [], True),
    ("agent/tickets", "get", "helpdeskAgentTickets", [], ["queue_id", "status"], False),
    ("agent/tickets/{id}", "get", "helpdeskAgentTicket", [], [], True),
    ("agent/tickets/{id}/status", "post", "helpdeskAgentTicketStatus", ["status", "expected_version"], [], True),
    ("owner/tickets", "get", "helpdeskOwnerTickets", [], ["queue_id", "status"], False),
    ("owner/tickets/{id}", "get", "helpdeskOwnerTicket", [], [], True),
    ("owner/tickets/{id}/assign", "post", "helpdeskOwnerTicketAssign", ["assigned_platform_user_id", "expected_version"], [], True),
    ("owner/tickets/{id}/status", "post", "helpdeskOwnerTicketStatus", ["status", "expected_version"], [], True),
]


def parameter(name, location, required=False):
    schema = FIELD.get(name, POSITIVE if name in ("organization_id", "id", "page", "per_page") else TEXT)
    if name == "page":
        schema = {**POSITIVE, "maximum": 1000000}
    elif name == "per_page":
        schema = {**POSITIVE, "maximum": 50}
    return {"name": name, "in": location, "required": required, "schema": schema}


def operation(method, name, body, filters, target):
    params = [parameter("organization_id", "path", True)]
    if target:
        params.append(parameter("id", "path", True))
    if method == "get" and not target:
        params += [parameter("page", "query"), parameter("per_page", "query")]
        params += [parameter(field, "query") for field in filters]
    params += [
        {"name": "Idempotency-Key", "in": "header", "required": True,
         "schema": {"type": "string", "format": "uuid"}},
        {"name": "X-Operation-Token", "in": "header", "required": True,
         "schema": {"type": "string", "pattern": "^[a-f0-9]{64}$"}},
    ]
    result = {
        "operationId": "standalone" + name[0].upper() + name[1:],
        "description": "Standalone Helpdesk HD01 command. Current platform identity, organization membership, installation, entitlement and role are rechecked before the isolated effect. Agent reads additionally require an active queue roster.",
        "parameters": params,
        "security": [{"bearerAuth": []}],
        "responses": {
            "202": {"description": "Durable command accepted; poll the private operation receipt for the business result."},
            "401": {"description": "Platform bearer token unavailable or revoked"},
            "403": {"description": "Current membership, role, queue roster or entitlement denied"},
            "404": {"description": "Record unavailable within this organization and visibility scope"},
            "409": {"description": "Version or status transition conflict"},
            "422": {"description": "Strict validation_error field map"},
            "504": {"description": "Remote Helpdesk command deadline exceeded"},
        },
    }
    if body:
        result["requestBody"] = {"required": True, "content": {"application/json": {"schema": {
            "type": "object", "additionalProperties": False,
            "required": body, "properties": {field: FIELD[field] for field in body},
        }}}}
        if name == "helpdeskAssignAgent":
            result["requestBody"]["content"]["application/json"]["schema"]["properties"]["expected_version"] = VERSION
    result["x-completed-result"] = {"description": "Returns a bounded data/meta page for lists, or the scoped queue, agent or ticket with server status options for detail/mutations."}
    return result


def generate():
    document = json.loads(OPENAPI.read_text(encoding="utf-8"))
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    for route, method, name, body, filters, target in ROUTES:
        path = f"/api/v1/platform/organizations/{{organization_id}}/helpdesk/{route}"
        filename = "path-helpdesk-" + route.replace("/{id}", "-id").replace("/", "-").replace("{", "").replace("}", "") + ".json"
        fragment = FRAGMENTS / filename
        existing = json.loads(fragment.read_text(encoding="utf-8")) if fragment.exists() else {}
        existing[method] = operation(method, name, body, filters, target)
        fragment.write_text(json.dumps(existing, indent=2) + "\n", encoding="utf-8")
        document["paths"][path] = {"$ref": f"./openapi/{filename}"}
        doc_path = f"docs/openapi/{filename}"
        if not any(item["path"] == doc_path for item in registry["documents"]):
            registry["documents"].append({"id": filename.removesuffix(".json"),
                                          "path": doc_path, "kind": "contract", "status": "active", "supersedes": []})
    OPENAPI.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    REGISTRY.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    generate()
