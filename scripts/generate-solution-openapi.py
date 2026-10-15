"""Generate the bounded solution commerce OpenAPI path contracts."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "openapi"


def field(type_name, **extra):
    return {"type": type_name, **extra}


IDENTIFIER = field("integer", minimum=1)
PAGE = field("integer", minimum=1, maximum=1000000)
PER_PAGE = field("integer", minimum=1, maximum=50)


def parameter(name, place, schema, required=False):
    return {"name": name, "in": place, "required": required, "schema": schema}


def operation(operation_id, method, *, standalone=False, public=False, body=None, query=None, detail=False,
              description=None):
    params = [] if standalone else [parameter("shop", "path", field("string", maxLength=80), True)]
    if not standalone and ("Purchase" in operation_id or "purchases" in operation_id.lower()):
        params.append(parameter("id", "path", IDENTIFIER, True))
    if standalone:
        params.append(parameter("id", "path", IDENTIFIER, True))
    if detail and "Purchase" not in operation_id and "purchase" not in operation_id.lower():
        params.append(parameter("id", "path", IDENTIFIER, True))
    for name, schema in (query or {}).items():
        params.append(parameter(name, "query", schema))
    params.extend([
        parameter("Idempotency-Key", "header", field("string", format="uuid"), True),
        parameter("X-Operation-Token", "header", field("string", pattern="^[a-f0-9]{64}$"), True),
    ])
    result = {"operationId": operation_id, "parameters": params,
              "responses": {"202": {"description": "Durably accepted; poll the private operation receipt.",
                  "content": {"application/json": {"schema": {"$ref": "../openapi.json#/components/schemas/Accepted"}}}},
                  "401": {"description": "Authentication required"},
                  "403": {"description": "Current shop or organization authority denied"},
                  "404": {"description": "Resource unavailable"},
                  "409": {"description": "Idempotency or state conflict"},
                  "422": {"description": "validation_error field map"}},
              "description": description or "Durable worker command; payment authority is verified by the payment worker."}
    if not public:
        result["security"] = [{"cookieAuth": []}, {"bearerAuth": []}]
    if body is not None:
        result["requestBody"] = {"required": True, "content": {"application/json": {
            "schema": {"type": "object", "properties": body, "required": list(body),
                       "additionalProperties": False}}}}
    return method.lower(), result


def write(name, *operations):
    OUTPUT.joinpath(name).write_text(json.dumps(dict(operations), indent=2) + "\n", encoding="utf-8")


write("path-solution-offerings.json",
      operation("solutionOfferings", "GET", public=True,
                query={"application_key": field("string", maxLength=80), "page": PAGE, "per_page": PER_PAGE}))
write("path-solution-offering.json", operation("solutionOffering", "GET", public=True, detail=True))
write("path-admin-solution-offerings.json",
      operation("publishSolutionOffering", "POST", body={
          "product_id": IDENTIFIER, "application_key": field("string", maxLength=80),
          "deliverables": field("array", minItems=1, maxItems=20,
                                items=field("string", maxLength=160))}))
write("path-solution-purchases.json",
      operation("solutionPurchases", "GET", query={"page": PAGE, "per_page": PER_PAGE}),
      operation("bindSolutionPurchase", "POST", body={"offering_id": IDENTIFIER, "order_id": IDENTIFIER},
                description="Bind an order owned by this shop user to an organization they own. Checkout pins the exact immutable offering version on the order; only a verified provider settlement grants access."))
write("path-solution-purchase-detail.json",
      operation("solutionPurchase", "GET", query={"purchase_id": IDENTIFIER}))
write("path-solution-purchase-retry.json",
      operation("retrySolutionPurchase", "POST", body={"purchase_id": IDENTIFIER}))
write("path-standalone-solution-purchases.json",
      operation("standaloneSolutionPurchases", "GET", standalone=True,
                query={"page": PAGE, "per_page": PER_PAGE}))
write("path-standalone-solution-purchase-detail.json",
      operation("standaloneSolutionPurchase", "GET", standalone=True,
                query={"purchase_id": IDENTIFIER}))
write("path-standalone-solution-purchase-retry.json",
      operation("standaloneRetrySolutionPurchase", "POST", standalone=True,
                body={"purchase_id": IDENTIFIER}))
