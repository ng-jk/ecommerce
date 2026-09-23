"""Assert the public contract of every generated API operation over real HTTP."""

import uuid

from test_worker_api import BASE, Client, address, admin, customer


def succeeded(result):
    assert result["status"] == "succeeded", result
    assert result["http_status"] == 200, result
    return result["result"]


def test_complete_crud_checkout_order_and_revocation():
    manager, buyer = admin(), customer()
    me = buyer.http.get(f"{BASE}/fashion/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["role"] == "customer"
    assert "password" not in me.json()["user"]
    invalid_create = manager.call("POST", "admin/products", {})
    assert invalid_create["http_status"] == 422
    assert {"name", "category", "price", "stock"} <= invalid_create["result"][
        "validation_error"
    ].keys()
    for path in ["admin/products?page=0", "admin/orders?status=invalid"]:
        rejected = manager.call("GET", path)
        assert rejected["http_status"] == 422
        assert "validation_error" in rejected["result"]
    product = succeeded(
        manager.call(
            "POST",
            "admin/products",
            {
                "name": "Full API journey",
                "category": "Contract tests",
                "description": "Synthetic product",
                "image_url": "https://example.com/test.png",
                "price": 1250,
                "stock": 3,
                "active": True,
            },
        )
    )["product"]
    product_id = product["id"]
    listing = succeeded(manager.call("GET", "admin/products?category=Contract%20tests"))
    assert any(item["id"] == product_id for item in listing["products"]["data"])
    assert "meta" in listing["products"]
    assert listing["options"]
    detail = succeeded(manager.call("GET", f"admin/products/{product_id}"))["product"]
    updated = succeeded(
        manager.call(
            "PATCH",
            f"admin/products/{product_id}",
            {
                "name": "Updated API journey",
                "expected_version": detail["version"],
            },
        )
    )["product"]
    assert updated["version"] == detail["version"] + 1
    stale = manager.call(
        "PATCH",
        f"admin/products/{product_id}",
        {"price": 1, "expected_version": detail["version"]},
    )
    assert stale["http_status"] == 409
    bad_price = manager.call(
        "PATCH",
        f"admin/products/{product_id}",
        {"price": True, "expected_version": updated["version"]},
    )
    assert bad_price["http_status"] == 422
    assert "price" in bad_price["result"]["validation_error"]
    public = succeeded(buyer.call("GET", f"products/{product_id}"))["product"]
    assert public["name"] == "Updated API journey"
    assert "deleted_at" not in public
    assert public["price"] == 1250
    searched = succeeded(
        buyer.call("GET", "products?search=Updated&category=Contract%20tests")
    )
    assert any(item["id"] == product_id for item in searched["products"]["data"])
    cart = succeeded(buyer.call("GET", "cart"))
    invalid_key = buyer.call(
        "POST",
        "checkout",
        {
            "checkout_key": "not-a-uuid",
            "expected_version": cart["version"],
            "shipping_address": address(),
        },
    )
    assert invalid_key["http_status"] == 422
    assert "checkout_key" in invalid_key["result"]["validation_error"]
    cart = succeeded(
        buyer.call(
            "PUT",
            "cart",
            {
                "items": [{"product_id": product_id, "quantity": 2}],
                "expected_version": cart["version"],
            },
        )
    )
    checkout = {
        "checkout_key": str(uuid.uuid4()),
        "shipping_address": address(),
        "expected_version": cart["version"],
    }
    order = succeeded(buyer.call("POST", "checkout", checkout))["order"]
    assert order["subtotal"] == 2500
    assert order["total"] == 3300
    replay = succeeded(buyer.call("POST", "checkout", checkout))["order"]
    assert replay["id"] == order["id"]
    orders = succeeded(buyer.call("GET", "orders"))["orders"]
    assert any(item["id"] == order["id"] for item in orders["data"])
    assert "meta" in orders
    assert buyer.call("GET", "orders?page=0")["http_status"] == 422
    admin_orders = succeeded(manager.call("GET", "admin/orders"))
    transitions = admin_orders["transitions"]
    while order["status"] in transitions:
        next_status = transitions[order["status"]]
        order = succeeded(
            manager.call(
                "PATCH",
                f"admin/orders/{order['id']}",
                {
                    "status": next_status,
                    "expected_version": order["version"],
                },
            )
        )["order"]
        assert order["status"] == next_status
    invalid = manager.call(
        "PATCH",
        f"admin/orders/{order['id']}",
        {
            "status": next(iter(transitions.values())),
            "expected_version": order["version"],
        },
    )
    assert invalid["http_status"] == 422
    assert "status" in invalid["result"]["validation_error"]
    detail = succeeded(manager.call("GET", f"admin/products/{product_id}"))["product"]
    assert detail["stock"] == 1
    assert succeeded(
        manager.call(
            "DELETE",
            f"admin/products/{product_id}",
            {
                "expected_version": detail["version"],
            },
        )
    ) == {"deleted": True}
    assert buyer.call("GET", f"products/{product_id}")["http_status"] == 404
    succeeded(buyer.call("POST", "auth/logout"))
    assert buyer.http.get(f"{BASE}/fashion/auth/me").status_code == 401


def test_other_shop_and_unauthenticated_boundaries():
    guest = Client("electronics")
    catalog = succeeded(guest.call("GET", "products"))
    assert catalog["products"]["data"]
    product = catalog["products"]["data"][0]
    detail = succeeded(guest.call("GET", f"products/{product['id']}"))
    assert detail["product"]["id"] == product["id"]
    for method, path in [
        ("GET", "cart"),
        ("PUT", "cart"),
        ("POST", "checkout"),
        ("GET", "orders"),
        ("GET", "admin/products"),
        ("GET", "admin/products/1"),
        ("POST", "admin/products"),
        ("PATCH", "admin/products/1"),
        ("DELETE", "admin/products/1"),
        ("GET", "admin/orders"),
        ("PATCH", "admin/orders/1"),
        ("POST", "auth/logout"),
    ]:
        response, _ = guest.submit(method, path, {})
        assert response.status_code == 401, (method, path, response.text)


def test_public_auth_and_admission_validation():
    guest = Client()
    for path, payload in [
        ("auth/login", {"email": "missing@example.test", "password": "wrong"}),
        ("auth/register", {}),
    ]:
        result = guest.call("POST", path, payload)
        assert result["http_status"] == 422
        assert "validation_error" in result["result"]
    response, _ = guest.submit("GET", "products", key="invalid-key")
    assert response.status_code == 422
    assert "key" in response.json()["validation_error"]
    response, _ = guest.submit("GET", "products", body={"oversized": "x" * 65537})
    assert response.status_code == 413
