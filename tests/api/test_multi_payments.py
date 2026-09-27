"""Exercise Stripe and custom payment providers through raw HTTP and workers."""

import hashlib
import hmac
import json
import time
import uuid

import httpx

from tests.api.test_assistant_matrix import Assistant
from tests.api.test_worker_api import Client, address

BASE = "http://localhost:8088"
CUSTOM_TOKEN = "TEST_CUSTOM_PAYMENT_TOKEN_2026_WITH_MORE_THAN_THIRTY_TWO_BYTES"


def _admin(shop):
    result = Client(shop).call(
        "POST",
        "auth/login",
        {
            "email": f"admin@{shop}.demo",
            "password": "Portfolio2026!",
            "device_name": "Multi-provider API tests",
        },
    )
    assert result["status"] == "succeeded", result
    return result["result"]["token"]


def _place_order(shop, token, payment_method):
    assistant = Assistant(shop, token)
    product = assistant.invoke(
        "createProduct",
        {
            "name": f"{payment_method} fixture {uuid.uuid4()}",
            "category": "Payment tests",
            "description": "Synthetic provider payment",
            "image_url": "https://example.test/payment.png",
            "price": 1200,
            "stock": 3,
            "active": True,
        },
    )["product"]
    assistant.invoke(
        "updateCart", {"items": [{"product_id": product["id"], "quantity": 1}]}
    )
    order = assistant.invoke(
        "checkout",
        {"shipping_address": address(), "payment_method": payment_method},
    )["order"]
    assert order["payment_method"] == payment_method
    assert order["total"] == 2000
    assert order["payment"]["status"] in {"queued", "creating", "pending"}
    return assistant, product, order


def _wait_for_order(assistant, order_id, predicate, message):
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        orders = assistant.invoke("orders")["orders"]["data"]
        current = next(item for item in orders if item["id"] == order_id)
        if predicate(current):
            return current
        time.sleep(0.1)
    raise AssertionError(message)


def test_stripe_signed_callback_is_idempotent_and_allows_fulfillment():
    token = _admin("stripe-test")
    assistant, product, order = _place_order("stripe-test", token, "stripe")
    current = _wait_for_order(
        assistant,
        order["id"],
        lambda item: item["payment"]["status"] == "pending",
        "Stripe Checkout session was not created",
    )
    assert current["payment"]["provider"] == "stripe"
    assert current["payment"]["checkout_url"].startswith(
        "https://checkout.stripe.com/c/pay/"
    )
    invoice = current["payment"]["invoice_id"]
    session_id = "cs_test_" + invoice.replace("-", "")
    event = {
        "id": "evt_test_" + uuid.uuid4().hex,
        "object": "event",
        "api_version": "2025-01-27.acacia",
        "created": int(time.time()),
        "data": {
            "object": {
                "id": session_id,
                "object": "checkout.session",
                "client_reference_id": invoice,
                "metadata": {"payment_id": invoice},
                "amount_total": order["total"],
                "currency": "myr",
                "livemode": False,
                "status": "complete",
                "payment_status": "paid",
            }
        },
        "livemode": False,
        "pending_webhooks": 1,
        "request": {"id": None, "idempotency_key": None},
        "type": "checkout.session.completed",
    }
    raw = json.dumps(event, separators=(",", ":"))
    timestamp = str(int(time.time()))
    digest = hmac.new(
        b"whsec_test", f"{timestamp}.{raw}".encode(), hashlib.sha256
    ).hexdigest()
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Stripe-Signature": f"t={timestamp},v1={digest}",
    }
    url = f"{BASE}/api/v1/payments/stripe"
    with httpx.Client(trust_env=False, timeout=10) as webhook:
        forged = webhook.post(
            url,
            content=raw,
            headers={**headers, "Stripe-Signature": f"t={timestamp},v1={'0' * 64}"},
        )
        assert forged.status_code == 401, forged.text
        first = webhook.post(url, content=raw, headers=headers)
        replay = webhook.post(url, content=raw, headers=headers)
    assert first.status_code == replay.status_code == 200
    assert first.json() == replay.json() == {"received": True}

    paid = _wait_for_order(
        assistant,
        order["id"],
        lambda item: item["payment"]["status"] == "paid",
        "Signed Stripe event did not settle payment",
    )
    assert paid["can_fulfill"] is True
    assert paid["payment"]["checkout_url"] is None
    fulfilled = assistant.invoke(
        "updateOrder", {"id": order["id"], "status": "processing"}
    )["order"]
    assert fulfilled["status"] == "processing"
    assert assistant.invoke("adminProduct", {"id": product["id"]})["product"][
        "stock"
    ] == 2


def test_custom_machine_attestation_auth_replay_status_and_fulfillment():
    token = _admin("custom-test")
    assistant, product, order = _place_order("custom-test", token, "bank-transfer")
    queued = _wait_for_order(
        assistant,
        order["id"],
        lambda item: item["payment"]["status"] == "pending",
        "Custom payment was not prepared",
    )
    assert queued["payment"]["provider"] == "custom"
    assert queued["payment"]["checkout_url"] is None
    invoice = queued["payment"]["invoice_id"]
    url = f"{BASE}/api/v1/payment-integrations/bank-transfer/confirm"
    key = str(uuid.uuid4())
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {CUSTOM_TOKEN}",
        "Idempotency-Key": key,
    }
    body = {"invoice_id": invoice}
    with httpx.Client(trust_env=False, timeout=10) as integration:
        denied = integration.post(
            url,
            json=body,
            headers={**headers, "Authorization": "Bearer wrong"},
        )
        assert denied.status_code == 401, denied.text
        first = integration.post(url, json=body, headers=headers)
        assert first.status_code == 202, first.text
        accepted = first.json()
        assert accepted["received"] is True
        assert accepted["status"] in {"queued", "processed"}
        assert isinstance(accepted["event_id"], int)
        replay = integration.post(url, json=body, headers=headers)
        assert replay.status_code == 202, replay.text
        assert replay.json()["event_id"] == accepted["event_id"]
        event_url = f"{BASE}/api/v1/payment-integrations/bank-transfer/{accepted['event_id']}"
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            status = integration.get(event_url, headers=headers)
            assert status.status_code == 200, status.text
            assert status.json()["event_id"] == accepted["event_id"]
            if status.json()["status"] == "processed":
                break
            time.sleep(0.1)
        else:
            raise AssertionError("Custom payment event did not process")

    paid = _wait_for_order(
        assistant,
        order["id"],
        lambda item: item["payment"]["status"] == "paid",
        "Custom payment event did not settle payment",
    )
    assert paid["can_fulfill"] is True
    fulfilled = assistant.invoke(
        "updateOrder", {"id": order["id"], "status": "processing"}
    )["order"]
    assert fulfilled["status"] == "processing"
    assert assistant.invoke("adminProduct", {"id": product["id"]})["product"][
        "stock"
    ] == 2
