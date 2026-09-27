"""Black-box tests against the isolated compose.test.yaml PostgreSQL stack."""

import secrets
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

import httpx

BASE = "http://localhost:8088/api/v1/shops"


class Client:
    def __init__(self, shop="fashion", token=None):
        self.shop = shop
        self.http = httpx.Client(
            timeout=10,
            trust_env=False,
            headers={
                "Accept": "application/json",
                **({"Authorization": f"Bearer {token}"} if token else {}),
            },
        )

    def submit(self, method, path, body=None, key=None, receipt=None):
        headers = {
            "Idempotency-Key": key or str(uuid.uuid4()),
            "X-Operation-Token": receipt or secrets.token_hex(32),
        }
        response = self.http.request(
            method, f"{BASE}/{self.shop}/{path}", json=body, headers=headers
        )
        return response, headers

    def finish(self, response, headers):
        assert response.status_code == 202, response.text
        data = response.json()
        deadline = time.monotonic() + 45
        poll_delay = 0.05
        while time.monotonic() < deadline:
            result = self.http.get(
                "http://localhost:8088" + data["poll_url"], headers=headers
            )
            assert result.status_code == 200, result.text
            operation = result.json()
            if operation["status"] in ("succeeded", "rejected", "failed"):
                return operation
            time.sleep(poll_delay)
            poll_delay = min(0.5, poll_delay * 1.5)
        raise AssertionError("Worker did not complete the accepted operation")

    def call(self, method, path, body=None):
        return self.finish(*self.submit(method, path, body))


def customer():
    guest = Client()
    result = guest.call(
        "POST",
        "auth/register",
        {
            "name": "API Tester",
            "email": f"{uuid.uuid4()}@example.test",
            "password": "Password2026!",
            "password_confirmation": "Password2026!",
            "device_name": "API tests",
            "role": "admin",
        },
    )
    assert result["status"] == "succeeded", result
    assert result["result"]["user"]["role"] == "customer"
    return Client(token=result["result"]["token"])


def admin():
    result = Client().call(
        "POST",
        "auth/login",
        {
            "email": "admin@fashion.demo",
            "password": "Portfolio2026!",
            "device_name": "API tests",
        },
    )
    assert result["status"] == "succeeded", result
    return Client(token=result["result"]["token"])


def address():
    return {
        "name": "Tester",
        "line1": "12 Test Street",
        "city": "Melaka",
        "postcode": "75000",
        "country": "MY",
    }


def test_raw_requests_reject_invalid_paging_and_hide_operation_receipts():
    client = Client()
    response, headers = client.submit("GET", "products?page=-1")
    result = client.finish(response, headers)
    assert result["status"] == "rejected"
    assert result["http_status"] == 422
    assert "page" in result["result"]["validation_error"]
    assert "errors" not in result["result"]
    unauthorized = client.http.get(
        "http://localhost:8088" + response.json()["poll_url"]
    )
    assert unauthorized.status_code == 404


def test_duplicate_admission_is_one_operation_and_payload_conflicts_are_rejected():
    client = Client()
    key, receipt = str(uuid.uuid4()), secrets.token_hex(32)
    first, headers = client.submit("GET", "products", key=key, receipt=receipt)
    second, _ = client.submit("GET", "products", key=key, receipt=receipt)
    assert first.json()["operation_id"] == second.json()["operation_id"]
    conflict, _ = client.submit(
        "GET", "products?search=other", key=key, receipt=receipt
    )
    assert conflict.status_code == 409
    assert client.finish(first, headers)["status"] == "succeeded"


def test_concurrent_last_unit_is_not_oversold_and_client_totals_are_ignored():
    manager = admin()
    product = manager.call(
        "POST",
        "admin/products",
        {
            "name": "Concurrency fixture",
            "category": "Tests",
            "description": "Isolated integration fixture",
            "image_url": "https://example.com/image.jpg",
            "price": 1000,
            "stock": 1,
            "active": True,
        },
    )["result"]["product"]
    buyers = [customer(), customer()]
    for buyer in buyers:
        result = buyer.call(
            "PUT",
            "cart",
            {
                "items": [{"product_id": product["id"], "quantity": 1}],
                "expected_version": 0,
            },
        )
        assert result["status"] == "succeeded", result

    def checkout(buyer):
        return buyer.call(
            "POST",
            "checkout",
            {
                "checkout_key": str(uuid.uuid4()),
                "shipping_address": address(),
                "expected_version": 1,
                "total": 1,
                "shipping": 0,
            },
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(checkout, buyers))
    assert sorted(result["http_status"] for result in results) == [200, 422], results
    success = next(result for result in results if result["status"] == "succeeded")
    assert success["result"]["order"]["total"] == 1800
    current = manager.call("GET", f"admin/products/{product['id']}")["result"][
        "product"
    ]
    assert current["stock"] == 0
    deleted = manager.call(
        "DELETE",
        f"admin/products/{product['id']}",
        {"expected_version": current["version"]},
    )
    assert deleted["status"] == "succeeded", deleted
    assert manager.call("GET", f"admin/products/{product['id']}")["http_status"] == 404


def test_stale_cart_writes_and_cross_shop_admin_requests_fail():
    buyer = customer()
    first = buyer.call("PUT", "cart", {"items": [], "expected_version": 0})
    assert first["status"] == "succeeded"
    stale = buyer.call("PUT", "cart", {"items": [], "expected_version": 0})
    assert stale["http_status"] == 409
    missing = buyer.call("PUT", "cart", {"items": []})
    assert missing["http_status"] == 422
    assert "expected_version" in missing["result"]["validation_error"]
    response, _ = buyer.submit("GET", "admin/products")
    assert response.status_code == 403
    buyer.shop = "electronics"
    response, _ = buyer.submit("GET", "cart")
    assert response.status_code == 403


def test_cart_boundary_types_and_duplicate_lines_do_not_change_state():
    buyer = customer()
    product = buyer.call("GET", "products")["result"]["products"]["data"][0]
    for quantity in [-1, 0, 100, 1.25, True, None, {}, [], "bogus", "1"]:
        result = buyer.call(
            "PUT",
            "cart",
            {
                "items": [{"product_id": product["id"], "quantity": quantity}],
                "expected_version": 0,
            },
        )
        assert result["http_status"] == 422, (quantity, result)
        assert "validation_error" in result["result"]
    duplicate = buyer.call(
        "PUT",
        "cart",
        {
            "items": [{"product_id": product["id"], "quantity": 1}] * 2,
            "expected_version": 0,
        },
    )
    assert duplicate["http_status"] == 422
    current = buyer.call("GET", "cart")["result"]
    assert current == {"items": [], "version": 0,
                       "payment_methods": {"simulated": "Simulated payment"},
                       "default_payment_method": "simulated"}
