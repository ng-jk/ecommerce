"""Publish Learning author and learner command contracts for standalone transport."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OPENAPI = ROOT / "docs/openapi.json"
REGISTRY = ROOT / "docs/registry.json"
FRAGMENTS = ROOT / "docs/openapi"

POSITIVE = {"type": "integer", "minimum": 1}
VERSION = {"type": "integer", "minimum": 0}
TEXT = {"type": "string", "minLength": 1}
QUESTION = {"type": "object", "additionalProperties": False, "required": ["prompt", "options", "correct_index"],
            "properties": {"prompt": {**TEXT, "maxLength": 1000},
                           "options": {"type": "array", "minItems": 2, "maxItems": 6, "items": {**TEXT, "maxLength": 500}},
                           "correct_index": VERSION}}
FIELD = {
    "code": {"type": "string", "minLength": 3, "maxLength": 80, "pattern": "^[a-z][a-z0-9-]*$"},
    "title": {**TEXT, "maxLength": 200},
    "description": {"type": "string", "maxLength": 10000},
    "access_mode": {"type": "string", "enum": ["free", "paid"]},
    "expected_version": VERSION,
    "course_id": POSITIVE,
    "content": {**TEXT, "maxLength": 20000},
    "position": {**POSITIVE, "maximum": 10000},
    "questions": {"type": "array", "minItems": 1, "maxItems": 20, "items": QUESTION},
    "pass_score": {**POSITIVE, "maximum": 100},
    "attempt_limit": {**POSITIVE, "maximum": 10},
    "answers": {"type": "array", "minItems": 1, "maxItems": 20, "items": VERSION},
}

ROUTES = [
    ("author/courses", "get", "learningAuthorCourses", [], True),
    ("courses", "post", "learningCreateCourse", ["code", "title", "description", "access_mode"], False),
    ("author/courses/{id}", "get", "learningAuthorCourse", [], True),
    ("courses/{id}", "put", "learningUpdateCourse", ["expected_version", "title", "description", "access_mode"], False),
    ("courses/{id}/publish", "post", "learningPublishCourse", ["expected_version"], False),
    ("courses/{id}/archive", "post", "learningArchiveCourse", ["expected_version"], False),
    ("author/lessons/{id}", "get", "learningAuthorLesson", [], False),
    ("author/assessments/{id}", "get", "learningAuthorAssessment", [], False),
    ("lessons", "post", "learningCreateLesson", ["course_id", "expected_version", "title", "content", "position"], False),
    ("lessons/{id}", "put", "learningUpdateLesson", ["expected_version", "title", "content", "position"], False),
    ("assessments", "post", "learningCreateAssessment", ["course_id", "expected_version", "title", "questions", "pass_score", "attempt_limit"], False),
    ("assessments/{id}", "put", "learningUpdateAssessment", ["expected_version", "title", "questions", "pass_score", "attempt_limit"], False),
    ("courses", "get", "learningCourses", [], True),
    ("courses/{id}", "get", "learningCourse", [], True),
    ("enrollments", "post", "learningEnroll", ["course_id"], False),
    ("enrollments", "get", "learningEnrollments", [], True),
    ("enrollments/{id}", "get", "learningEnrollment", [], False),
    ("lessons/{id}", "get", "learningReadLesson", [], False),
    ("assessments/{id}", "get", "learningAssessment", [], False),
    ("assessments/{id}/attempts", "post", "learningSubmitAttempt", ["answers"], False),
    ("attempts", "get", "learningAttempts", [], True),
]


def operation(route, method, name, body, paged):
    params = [{"name": "organization_id", "in": "path", "required": True, "schema": POSITIVE}]
    if "{id}" in route:
        params.append({"name": "id", "in": "path", "required": True, "schema": POSITIVE})
    if paged:
        params += [{"name": "page", "in": "query", "schema": {**POSITIVE, "maximum": 1000000}},
                   {"name": "per_page", "in": "query", "schema": {**POSITIVE, "maximum": 50}}]
        if route == "author/courses":
            params.append({"name": "status", "in": "query", "schema": {"type": "string", "enum": ["draft", "published", "archived"]}})
    params += [{"name": "Idempotency-Key", "in": "header", "required": True, "schema": {"type": "string", "format": "uuid"}},
               {"name": "X-Operation-Token", "in": "header", "required": True, "schema": {"type": "string", "pattern": "^[a-f0-9]{64}$"}}]
    result = {"operationId": "standalone" + name[0].upper() + name[1:],
              "description": "Standalone Learning command. Current platform identity, membership, installation, entitlement and role are checked before the isolated effect. Paid learner access requires a service-local verified settlement grant. Lesson delivery is not proof of study.",
              "parameters": params, "security": [{"bearerAuth": []}],
              "responses": {"202": {"description": "Durable command accepted; poll its private result receipt"},
                            "401": {"description": "Token unavailable or revoked"},
                            "403": {"description": "Current membership, role or entitlement denied"},
                            "404": {"description": "Course or record unavailable in this organization and visibility scope"},
                            "409": {"description": "Version, publication, or attempt-limit conflict"},
                            "422": {"description": "Strict validation_error field map"},
                            "504": {"description": "Remote Learning command deadline exceeded"}}}
    if body:
        result["requestBody"] = {"required": True, "content": {"application/json": {"schema": {
            "type": "object", "additionalProperties": False, "required": body,
            "properties": {field: FIELD[field] for field in body}}}}}
    if name == "learningAuthorAssessment":
        result["x-completed-result"] = {"description": "Author detail includes the answer key; only an authorized organization owner can read it."}
    elif name == "learningAssessment":
        result["x-completed-result"] = {"description": "Learner detail omits correct_index and requires an active enrollment."}
    else:
        result["x-completed-result"] = {"description": "Scoped business result, or bounded data/meta page for lists."}
    return result


def generate():
    document = json.loads(OPENAPI.read_text(encoding="utf-8"))
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    for route, method, name, body, paged in ROUTES:
        path = f"/api/v1/platform/organizations/{{organization_id}}/learning/{route}"
        filename = "path-learning-" + route.replace("/{id}", "-id").replace("/", "-") + ".json"
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
