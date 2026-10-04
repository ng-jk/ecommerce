"""Merchant isolation through public HTTP, durable workers and AI dispatch."""

import secrets
import uuid
from concurrent.futures import ThreadPoolExecutor

from tests.api.test_assistant_matrix import Assistant
from tests.api.test_multi_payments import _admin
from tests.api.test_worker_api import Client


def account(shop):
    result = Client(shop).call(
        "POST",
        "auth/register",
        {
            "name": "Plugin isolation customer",
            "email": f"{uuid.uuid4()}@example.test",
            "password": "Password2026!",
            "password_confirmation": "Password2026!",
            "device_name": "Plugin API tests",
        },
    )
    assert result["status"] == "succeeded", result
    data = result["result"]
    return (
        Client(shop, data["token"]),
        Assistant(shop, data["token"]),
        data["user"]["id"],
    )


def result(client, method, path, data=None, status=200):
    response, headers = client.submit(method, path, data)
    if response.status_code != 202:
        assert response.status_code == status, response.text
        return response.json()
    terminal = client.finish(response, headers)
    assert terminal["http_status"] == status, terminal
    return terminal["result"]


def discover(assistant):
    return {
        tool["name"] for tool in assistant.turn({"discover": True})["available_actions"]
    }


def test_plugin_config_and_loyalty_are_merchant_scoped(clean_plugin_data):
    admin_a = Client("fashion", _admin("fashion"))
    admin_b = Client("electronics", _admin("electronics"))
    ai_a = Assistant(
        "fashion", admin_a.http.headers["Authorization"].removeprefix("Bearer ")
    )
    a, ai_customer, user_a = account("fashion")
    b, ai_b, user_b = account("electronics")
    result(admin_a, "POST", "admin/plugins", {"plugin_id": "loyalty"})
    result(admin_b, "POST", "admin/plugins", {"plugin_id": "loyalty"})
    listing_a = result(admin_a, "GET", "admin/plugins?plugin_id=loyalty")
    listing_b = result(admin_b, "GET", "admin/plugins?plugin_id=loyalty")
    plugin_a = listing_a["plugins"]["data"][0]
    plugin_b = listing_b["plugins"]["data"][0]
    assert listing_a["plugins"]["meta"]["total"] == 1
    assert not plugin_a["enabled"] and not plugin_b["enabled"]
    assert "loyaltyBalance" not in discover(ai_customer)
    result(a, "GET", "plugins/loyalty/balance", status=403)
    result(a, "GET", "admin/plugins", status=403)
    result(Client(), "GET", "plugins/loyalty/balance", status=401)
    result(admin_b, "GET", f"admin/plugins/{plugin_a['id']}", status=404)
    result(
        admin_b,
        "PATCH",
        f"admin/plugins/{plugin_a['id']}",
        {
            "expected_version": plugin_a["version"],
            "enabled": True,
        },
        404,
    )
    result(admin_a, "POST", "admin/plugins", {"plugin_id": "loyalty"}, 422)
    result(admin_a, "POST", "admin/plugins", {"plugin_id": "untrusted-code"}, 422)
    enabled = result(
        admin_a,
        "PATCH",
        f"admin/plugins/{plugin_a['id']}",
        {
            "expected_version": plugin_a["version"],
            "enabled": True,
            "customer_enabled": True,
            "max_credit": 50,
        },
    )["plugin"]
    result(
        admin_a,
        "PATCH",
        f"admin/plugins/{plugin_a['id']}",
        {
            "expected_version": plugin_a["version"],
            "enabled": False,
        },
        409,
    )
    assert "loyaltyBalance" in discover(ai_customer)
    assert "loyaltyBalance" not in discover(ai_b)
    assert "creditLoyalty" in discover(ai_a)
    assert "creditLoyalty" not in discover(ai_customer)
    assert result(a, "GET", "plugins/loyalty/balance")["balance"]["points"] == 0
    result(b, "GET", "plugins/loyalty/balance", status=403)
    result(
        admin_a,
        "POST",
        "admin/plugins/loyalty/credit",
        {
            "user_id": user_b,
            "points": 10,
            "reason": "Cross-merchant attempt",
        },
        404,
    )
    for points in [0, -1, 1.5, 51, 10001]:
        rejected = result(
            admin_a,
            "POST",
            "admin/plugins/loyalty/credit",
            {
                "user_id": user_a,
                "points": points,
                "reason": "Invalid credit",
            },
            422,
        )
        assert "validation_error" in rejected
    result(
        a,
        "POST",
        "admin/plugins/loyalty/credit",
        {
            "user_id": user_a,
            "points": 10,
            "reason": "Customer privilege escalation",
        },
        403,
    )
    key, receipt = str(uuid.uuid4()), secrets.token_hex(32)
    payload = {"user_id": user_a, "points": 10, "reason": "Approved adjustment"}
    first, headers = admin_a.submit(
        "POST", "admin/plugins/loyalty/credit", payload, key, receipt
    )
    original = admin_a.finish(first, headers)
    duplicate, again = admin_a.submit(
        "POST", "admin/plugins/loyalty/credit", payload, key, receipt
    )
    replay = admin_a.finish(duplicate, again)
    assert original["status"] == "succeeded"
    assert replay["operation_id"] == original["operation_id"]
    assert replay["result"]["balance"]["points"] == 10

    # Independent concurrent commands must preserve every increment.
    def credit(_):
        return result(
            admin_a,
            "POST",
            "admin/plugins/loyalty/credit",
            {
                "user_id": user_a,
                "points": 1,
                "reason": "Concurrent adjustment",
            },
        )

    with ThreadPoolExecutor(max_workers=3) as pool:
        assert len(list(pool.map(credit, range(3)))) == 3
    assert ai_customer.invoke("loyaltyBalance")["balance"]["points"] == 13
    assert (
        ai_a.invoke(
            "creditLoyalty",
            {
                "user_id": user_a,
                "points": 2,
                "reason": "Confirmed AI adjustment",
            },
        )["balance"]["points"]
        == 15
    )
    pending = ai_a.turn(
        {
            "action": "creditLoyalty",
            "data": {
                "user_id": user_a,
                "points": 4,
                "reason": "Pending confirmation",
            },
        }
    )
    assert pending["status"] == "needs_confirmation"
    disabled = result(
        admin_a,
        "PATCH",
        f"admin/plugins/{plugin_a['id']}",
        {
            "expected_version": enabled["version"],
            "enabled": False,
        },
    )["plugin"]
    ai_a.turn(
        {
            "conversation_id": pending["conversation_id"],
            "conversation_version": pending["conversation_version"],
            "confirm": True,
        },
        403,
    )
    result(a, "GET", "plugins/loyalty/balance", status=403)
    assert "loyaltyBalance" not in discover(ai_customer)
    assert (
        result(admin_b, "GET", f"admin/plugins/{plugin_b['id']}")["plugin"] == plugin_b
    )
    # Re-enable without customer grant: data retained but customer still denied.
    restricted = result(
        admin_a,
        "PATCH",
        f"admin/plugins/{plugin_a['id']}",
        {
            "expected_version": disabled["version"],
            "enabled": True,
            "customer_enabled": False,
        },
    )["plugin"]
    result(a, "GET", "plugins/loyalty/balance", status=403)
    result(
        admin_a,
        "PATCH",
        f"admin/plugins/{plugin_a['id']}",
        {
            "expected_version": restricted["version"],
            "customer_enabled": True,
        },
    )
    assert result(a, "GET", "plugins/loyalty/balance")["balance"]["points"] == 15
