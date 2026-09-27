"""Real HTTP/PG/worker flow with Billplz alone faked in isolated Compose."""

import hashlib
import hmac
import time
import uuid

import httpx

from tests.api.test_assistant_matrix import Assistant
from tests.api.test_worker_api import Client, address


def test_duitnow_checkout_callback_and_ai_order_status():
    login = Client("payment-test").call("POST", "auth/login", {
        "email": "admin@payment-test.demo", "password": "Portfolio2026!",
        "device_name": "Payment API verification",
    })
    assert login["status"] == "succeeded", login
    token = login["result"]["token"]
    client = Client("payment-test", token)
    assistant = Assistant("payment-test", token)
    product = assistant.invoke("createProduct", {
        "name": "Payment fixture " + str(uuid.uuid4()), "category": "Payment tests",
        "description": "Synthetic provider payment", "image_url": "https://example.test/item.png",
        "price": 1200, "stock": 2, "active": True,
    })["product"]
    assistant.invoke("updateCart", {"items": [{"product_id": product["id"], "quantity": 1}]})
    order = assistant.invoke("checkout", {"shipping_address": address()})["order"]
    assert order["payment_method"] == "billplz"
    assert order["total"] == 2000
    assert order["payment"]["status"] == "queued"
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        orders = client.call("GET", "orders")["result"]["orders"]["data"]
        current = next(item for item in orders if item["id"] == order["id"])
        if current["payment"]["status"] == "pending":
            break
        time.sleep(0.1)
    else:
        raise AssertionError("Payment link was not created")
    assert current["payment"]["checkout_url"].startswith("https://www.billplz-sandbox.com/bills/test-")
    blocked = client.call("PATCH", f"admin/orders/{order['id']}", {
        "status": "processing", "expected_version": current["version"],
    })
    assert blocked["http_status"] == 422, blocked
    url = "http://localhost:8088/api/v1/payments/billplz/" + order["payment"]["public_id"]
    payload = {"id": "test-" + order["payment"]["public_id"], "paid": "true"}
    with httpx.Client(trust_env=False, timeout=10, headers={"Accept": "application/json"}) as webhook:
        assert webhook.post(url, data=payload).status_code == 401
        source = "|".join(sorted((key + value for key, value in payload.items()), key=str.lower))
        payload["x_signature"] = hmac.new(b"isolated-signature-test", source.encode(), hashlib.sha256).hexdigest()
        assert webhook.post(url, data={**payload, "paid": "false"}).status_code == 401
        for _ in range(2):
            response = webhook.post(url, data=payload)
            assert response.status_code == 200, response.text
            assert response.json() == {"received": True}
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        orders = assistant.invoke("orders")["orders"]["data"]
        current = next(item for item in orders if item["id"] == order["id"])
        if current["payment"]["status"] == "paid":
            break
        time.sleep(0.1)
    else:
        raise AssertionError("Verified callback did not settle payment")
    assert current["can_fulfill"] is True
    assert current["payment"]["checkout_url"] is None
    assert "collection_id" not in current["payment"]
    advanced = assistant.invoke("updateOrder", {"id": order["id"], "status": "processing"})
    assert advanced["order"]["status"] == "processing"
    assert assistant.invoke("adminProduct", {"id": product["id"]})["product"]["stock"] == 1
    guest = Client("payment-test")
    response, _ = guest.submit("GET", "orders")
    assert response.status_code == 401
