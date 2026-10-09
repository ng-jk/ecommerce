"""Exercise every commerce action through the assistant with real workers and SQL."""

import json
import secrets
import uuid
from pathlib import Path

import pytest

from tests.api.test_worker_api import Client, address


class Assistant:
    def __init__(self, shop, token=None):
        self.client = Client(shop, token)
        self.receipt = secrets.token_hex(32)
        self.executed = set()

    def turn(self, body, status=200):
        result = self.client.finish(
            *self.client.submit("POST", "assistant", body, receipt=self.receipt)
        )
        assert result["http_status"] == status, result
        return result["result"]

    def invoke(self, name, data=None):
        result = self.turn({"action": name, "data": data or {}})
        if result["status"] == "needs_confirmation":
            result = self.turn(
                {
                    "conversation_id": result["conversation_id"],
                    "conversation_version": result["conversation_version"],
                    "confirm": True,
                }
            )
        assert result["status"] == "completed", result
        assert result["executed_action"]
        self.executed.add(name)
        return result["api_result"]


@pytest.mark.parametrize("shop", ["fashion", "electronics"])
def test_all_business_functions_through_assistant(shop):
    guest = Assistant(shop)
    discovered = guest.turn({"discover": True})
    assert discovered["role"] == "guest"
    assert {t["name"] for t in discovered["available_actions"]} == {
        "catalog",
        "product",
        "login",
        "register",
    }
    assert all(t["allowed_roles"] for t in discovered["available_actions"])
    catalog = guest.invoke("catalog", {"page": 1})
    assert catalog["products"]["data"]
    first = catalog["products"]["data"][0]
    assert guest.invoke("product", {"id": first["id"]})["product"]["id"] == first["id"]
    email = f"assistant-{uuid.uuid4()}@example.test"
    credentials = {
        "email": email,
        "password": "Password2026!",
        "device_name": "Assistant verification",
    }
    account = guest.invoke(
        "register",
        {
            **credentials,
            "name": "Assistant Tester",
            "password_confirmation": credentials["password"],
        },
    )
    assert account["user"]["role"] == "customer"
    customer = Assistant(shop, account["token"])
    customer_tools = customer.turn({"discover": True})
    assert customer_tools["role"] == "customer"
    assert len(customer_tools["available_actions"]) == 13
    assert customer.invoke("me")["user"]["email"] == email
    assert customer.invoke("cart")["items"] == []
    assert customer.invoke("logout")["logged_out"]
    login = guest.invoke("login", credentials)
    earlier_customer_actions = customer.executed.copy()
    customer = Assistant(shop, login["token"])
    admin_login = guest.invoke(
        "login",
        {
            "email": f"admin@{shop}.demo",
            "password": "Portfolio2026!",
            "device_name": "Assistant verification",
        },
    )
    admin = Assistant(shop, admin_login["token"])
    tools = admin.turn({"discover": True})["available_actions"]
    assert len(tools) == 27
    installation = admin.invoke("installPlugin", {"plugin_id": "loyalty"})["plugin"]
    assert installation["enabled"] is False
    assert admin.invoke("adminPlugins", {"plugin_id": "loyalty"})["plugins"]["data"]
    assert (
        admin.invoke("adminPlugin", {"id": installation["id"]})["plugin"]["id"]
        == installation["id"]
    )
    changed_plugin = admin.invoke(
        "updatePlugin", {"id": installation["id"], "max_credit": 100}
    )["plugin"]
    assert changed_plugin["max_credit"] == 100 and not changed_plugin["enabled"]
    inventory = admin.invoke("adminProducts", {"page": 1})
    assert inventory["products"]["data"]
    product = admin.invoke(
        "createProduct",
        {
            "name": "Assistant audit product",
            "category": "Audit",
            "description": "Synthetic verification fixture",
            "image_url": "https://example.com/audit.jpg",
            "price": 2500,
            "stock": 10,
            "active": True,
            "specifications": {"material": "cotton"},
        },
    )["product"]
    product_id = product["id"]
    filtered = guest.invoke(
        "catalog", {"search": "audit", "category": "Audit", "page": 1}
    )["products"]
    assert filtered["data"] and all(
        row["category"] == "Audit" for row in filtered["data"]
    )
    assert guest.invoke("catalog", {"page": 99999})["products"]["data"] == []
    assert admin.invoke("adminProducts", {"category": "Audit"})["products"]["data"]
    assert admin.invoke("adminProduct", {"id": product_id})["product"]["stock"] == 10
    changed = admin.invoke(
        "updateProduct", {"id": product_id, "price": 3000, "stock": 12}
    )["product"]
    assert changed["price"] == 3000 and changed["stock"] == 12
    cart = customer.invoke("updateCart", {"product_id": product_id, "quantity": 2})
    assert cart["items"][0]["quantity"] == 2
    # Quantity decrease, removal and full-cart replacement share the same action.
    cart = customer.invoke(
        "updateCart", {"items": [{"product_id": product_id, "quantity": 1}]}
    )
    assert cart["items"][0]["quantity"] == 1
    assert customer.invoke("updateCart", {"items": []})["items"] == []
    customer.invoke(
        "updateCart", {"items": [{"product_id": product_id, "quantity": 2}]}
    )
    order = customer.invoke("checkout", {"shipping_address": address()})["order"]
    assert order["total"] == 6800 and order["status"] == "placed"
    assert customer.invoke("cart")["items"] == []
    assert (
        customer.invoke("orders", {"status": "placed"})["orders"]["data"][0]["id"]
        == order["id"]
    )
    assert any(
        row["id"] == order["id"]
        for row in admin.invoke("adminOrders", {"status": "placed"})["orders"]["data"]
    )
    for status in ["processing", "shipped", "completed"]:
        advanced = admin.invoke("updateOrder", {"id": order["id"], "status": status})[
            "order"
        ]
        assert advanced["status"] == status
    assert admin.invoke("adminProduct", {"id": product_id})["product"]["stock"] == 10
    assert admin.invoke("deleteProduct", {"id": product_id})["deleted"]
    admin.turn({"action": "adminProduct", "data": {"id": product_id}}, 404)
    customer.turn({"action": "adminProducts"}, 403)
    guest.turn({"action": "cart"}, 403)
    customer.turn(
        {
            "action": "updateCart",
            "data": {"items": [{"product_id": first["id"], "quantity": -1}]},
        },
        422,
    )
    # These actions ran on the earlier authenticated instance before signing out.
    executed = (
        guest.executed | customer.executed | admin.executed | earlier_customer_actions
    )
    # Package lifecycle tools have their own approved-ZIP fixtures and complete
    # structured AI round trips in test_miniapps.py.
    miniapp_tools = {
        "miniapps",
        "launchMiniapp",
        "invokeMiniapp",
        "adminMiniapps",
        "installMiniapp",
        "updateMiniapp",
    }
    expected = {t["name"] for t in tools} - miniapp_tools
    assert executed == expected
    output = Path("test-results/assistant")
    output.mkdir(parents=True, exist_ok=True)
    (output / f"{shop}-matrix.json").write_text(
        json.dumps(
            {
                "shop": shop,
                "passed": True,
                "mode": "structured assistant dispatch; not free-form model accuracy",
                "verified_actions": sorted(executed),
                "count": len(executed),
            },
            indent=2,
        ),
        encoding="utf-8",
    )


def test_logout_receipt_is_available_to_concurrent_pollers():
    from concurrent.futures import ThreadPoolExecutor

    guest = Assistant("electronics")
    registered = guest.invoke(
        "register",
        {
            "name": "Logout race",
            "email": f"logout-{uuid.uuid4()}@example.test",
            "password": "Password2026!",
            "password_confirmation": "Password2026!",
            "device_name": "logout race",
        },
    )
    client = Client("electronics", registered["token"])
    response, headers = client.submit("POST", "auth/logout")
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: client.finish(response, headers), range(4)))
    assert all(
        result["status"] == "succeeded" and result["result"]["logged_out"]
        for result in results
    )
