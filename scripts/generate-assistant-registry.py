"""Generate the backend tool catalog from the versioned OpenAPI contract."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACTION = {
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
