"""Exercise each solution commerce action through authorized assistant dispatch."""

import uuid

from test_assistant_matrix import Assistant
from test_platform_identity import success
from test_solution_commerce import (
    confirm_custom_payment,
    paid_order,
    seed_retryable_provisioning,
    shop_admin,
    shop_buyer,
)
from test_worker_api import address


def test_solution_tools_use_published_offering_and_verified_settlement():
    shop = "custom-test"
    admin_client = shop_admin()
    buyer_client, _ = shop_buyer()
    admin = Assistant(shop, admin_client.http.headers["Authorization"].removeprefix("Bearer "))
    buyer = Assistant(shop, buyer_client.http.headers["Authorization"].removeprefix("Bearer "))
    guest = Assistant(shop)
    solution_tools = {
        "solutionOfferings", "solutionOffering", "publishSolutionOffering",
        "solutionPurchases", "bindSolutionPurchase", "solutionPurchase",
        "retrySolutionPurchase",
    }
    for assistant, expected in (
        (guest, {"solutionOfferings", "solutionOffering"}),
        (buyer, solution_tools - {"publishSolutionOffering"}),
        (admin, solution_tools),
    ):
        discovered = assistant.turn({"discover": True})
        assert {item["name"] for item in discovered["available_actions"]} & solution_tools == expected

    product = success(admin_client, "POST", "admin/products", {
        "name": "Assistant solution", "category": "Solutions",
        "description": "Synthetic isolated assistant offering",
        "image_url": "https://example.test/solution.png",
        "price": 1200, "stock": 3, "active": True,
    })["product"]
    offering = admin.invoke("publishSolutionOffering", {
        "product_id": product["id"], "application_key": "crm",
        "deliverables": ["CRM workspace"],
    })["offering"]
    offering_id = offering["id"]
    directory = guest.invoke("solutionOfferings", {"application_key": "crm"})
    assert any(item["id"] == offering_id for item in directory["data"])
    assert guest.invoke("solutionOffering", {"id": offering_id})["offering"]["version"] == 1

    organization = success(buyer_client, "POST", "platform/organizations", {
        "code": "assistant-solution-" + uuid.uuid4().hex,
        "name": "Assistant solution owner",
    })["organization"]
    organization_id = organization["id"]
    cart = success(buyer_client, "PUT", "cart", {
        "items": [{"product_id": product["id"], "quantity": 1}],
        "expected_version": 0,
    })
    order = success(buyer_client, "POST", "checkout", {
        "checkout_key": str(uuid.uuid4()), "shipping_address": address(),
        "payment_method": "bank-transfer", "expected_version": cart["version"],
    })["order"]
    assert order["solution_offering_id"] == offering_id
    bound = buyer.invoke("bindSolutionPurchase", {
        "id": organization_id, "offering_id": offering_id, "order_id": order["id"],
    })
    purchase_id = bound["purchase_id"]
    listed = buyer.invoke("solutionPurchases", {"id": organization_id})
    assert any(item["id"] == purchase_id for item in listed["data"])
    pending = buyer.invoke("solutionPurchase", {
        "id": organization_id, "purchase_id": purchase_id,
    })
    assert pending["status"] == "awaiting_settlement"

    confirm_custom_payment(order["payment"]["invoice_id"])
    assert paid_order(buyer_client, order["id"])["payment"]["status"] == "paid"
    seed_retryable_provisioning(purchase_id, organization_id)
    retried = buyer.invoke("retrySolutionPurchase", {
        "id": organization_id, "purchase_id": purchase_id,
    })
    assert retried["status"] == "queued"
    assert guest.executed | admin.executed | buyer.executed == solution_tools
