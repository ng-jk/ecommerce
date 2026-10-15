"""Write the isolated Builder page contract fragments and register them."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
BASE = "/api/v1/platform/organizations/{organization_id}/builder/pages"

INTEGER = {"type": "integer", "minimum": 1}
VERSION = {"type": "integer", "minimum": 0}
STRING = {"type": "string"}
BLOCK = {
    "oneOf": [
        {"type": "object", "additionalProperties": False, "required": ["type", "text", "level"],
         "properties": {"type": {"enum": ["heading"]}, "text": {"type": "string", "maxLength": 200},
                        "level": {"type": "integer", "minimum": 1, "maximum": 3}}},
        {"type": "object", "additionalProperties": False, "required": ["type", "text"],
         "properties": {"type": {"enum": ["paragraph"]}, "text": {"type": "string", "maxLength": 2000}}},
        {"type": "object", "additionalProperties": False, "required": ["type", "src", "alt"],
         "properties": {"type": {"enum": ["image"]}, "src": {"type": "string", "format": "uri", "pattern": "^https://"},
                        "alt": {"type": "string", "maxLength": 200}}},
        {"type": "object", "additionalProperties": False, "required": ["type", "label", "url"],
         "properties": {"type": {"enum": ["button"]}, "label": {"type": "string", "maxLength": 100},
                        "url": {"type": "string", "format": "uri", "pattern": "^https://"}}},
    ]
}
BLOCKS = {"type": "array", "maxItems": 20, "items": BLOCK}
PAGE = {"type": "object", "additionalProperties": False,
        "required": ["id", "slug", "title", "blocks", "status", "version", "published_version", "published_at"],
        "properties": {"id": INTEGER, "slug": {"type": "string", "maxLength": 100},
                       "title": {"type": "string", "maxLength": 200}, "blocks": BLOCKS,
                       "status": {"enum": ["draft", "published"]}, "version": VERSION,
                       "published_version": {"type": "integer", "minimum": 0, "nullable": True},
                       "published_at": {"type": "string", "format": "date-time", "nullable": True}}}
OPTIONS = {"type": "object", "additionalProperties": False, "required": ["status", "block_type"],
           "properties": {"status": {"type": "object", "additionalProperties": STRING},
                          "block_type": {"type": "object", "additionalProperties": STRING}}}
DETAIL = {"type": "object", "additionalProperties": False, "required": ["page", "options"],
          "properties": {"page": PAGE, "options": OPTIONS}}
LIST = {"type": "object", "additionalProperties": False, "required": ["data", "meta"],
        "properties": {"data": {"type": "array", "items": PAGE},
                       "meta": {"type": "object", "additionalProperties": False,
                                "required": ["current_page", "per_page", "last_page", "total", "options"],
                                "properties": {"current_page": INTEGER, "per_page": INTEGER,
                                               "last_page": INTEGER, "total": {"type": "integer", "minimum": 0},
                                               "options": OPTIONS}}}}
RENDER = {"type": "object", "additionalProperties": False, "required": ["render"],
          "properties": {"render": {"type": "object", "additionalProperties": False,
                                    "required": ["slug", "title", "blocks", "published_version"],
                                    "properties": {"slug": STRING, "title": STRING,
                                                   "blocks": BLOCKS, "published_version": VERSION}}}}


def parameter(name, location, schema):
    return {"name": name, "in": location, "required": True, "schema": schema}


def operation(name, description, result, *, item=False, query=(), body=None):
    parameters = [parameter("organization_id", "path", INTEGER)]
    if item:
        parameters.append(parameter("id", "path", INTEGER))
    parameters.extend({"name": key, "in": "query", "schema": schema} for key, schema in query)
    parameters.extend([parameter("Idempotency-Key", "header", {"type": "string", "format": "uuid"}),
                       parameter("X-Operation-Token", "header", {"type": "string", "pattern": "^[a-f0-9]{64}$"})])
    value = {"operationId": name, "description": description, "parameters": parameters,
             "security": [{"bearerAuth": []}],
             "responses": {"202": {"description": "Committed Builder operation; poll its private receipt.",
                                   "content": {"application/json": {"schema": {"$ref": "../openapi.json#/components/schemas/Accepted"}}}},
                           "401": {"description": "Authentication required"},
                           "403": {"description": "Current organization membership or Builder entitlement denied"},
                           "404": {"description": "Builder page unavailable in this organization"},
                           "409": {"description": "Version conflict"},
                           "422": {"description": "validation_error field map"},
                           "504": {"description": "Remote Builder command deadline exceeded"}},
             "x-completed-result": result}
    if body is not None:
        value["requestBody"] = {"required": True, "content": {"application/json": {"schema": body}}}
    return value


def obj(required, properties):
    return {"type": "object", "additionalProperties": False, "required": required, "properties": properties}


CREATE = obj(["slug", "title", "blocks"], {"slug": {"type": "string", "minLength": 2, "maxLength": 100,
                                                 "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$"},
                                             "title": {"type": "string", "minLength": 1, "maxLength": 200},
                                             "blocks": BLOCKS})
UPDATE = obj(["title", "blocks", "expected_version"], {"title": CREATE["properties"]["title"],
                                                           "blocks": BLOCKS, "expected_version": VERSION})
PUBLISH = obj(["expected_version"], {"expected_version": VERSION})
FRAGMENTS = {
    "path-builder-pages.json": {
        "get": operation("builderPages", "List organization Builder pages with indexed status filter.", LIST,
                         query=(("page", INTEGER), ("per_page", {"type": "integer", "minimum": 1, "maximum": 50}),
                                ("status", {"enum": ["draft", "published"]}))),
        "post": operation("builderCreatePage", "Owner: create a Builder draft with declarative blocks.", DETAIL, body=CREATE),
    },
    "path-builder-pages-id.json": {
        "get": operation("builderPage", "View one organization Builder page draft.", DETAIL, item=True),
        "patch": operation("builderUpdatePage", "Owner: update a Builder draft with expected version.", DETAIL,
                           item=True, body=UPDATE),
    },
    "path-builder-pages-id-publish.json": {
        "post": operation("builderPublishPage", "Owner: publish an immutable snapshot of the current draft.", DETAIL,
                          item=True, body=PUBLISH),
    },
    "path-builder-pages-id-render.json": {
        "get": operation("builderRenderPage", "Read the latest published declarative snapshot; never executable HTML.",
                         RENDER, item=True),
    },
}

for filename, fragment in FRAGMENTS.items():
    (DOCS / "openapi" / filename).write_text(json.dumps(fragment, indent=2) + "\n", encoding="utf-8")

spec_path = DOCS / "openapi.json"
spec = json.loads(spec_path.read_text(encoding="utf-8"))
for suffix, filename in (("", "path-builder-pages.json"), ("/{id}", "path-builder-pages-id.json"),
                         ("/{id}/publish", "path-builder-pages-id-publish.json"),
                         ("/{id}/render", "path-builder-pages-id-render.json")):
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
