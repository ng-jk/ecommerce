"""Real solution purchase commands on the isolated commerce and service stack."""

import subprocess
import time
import uuid

import httpx
from test_platform_identity import identity, success
from test_worker_api import Client, address

BASE = "http://localhost:8088"
CUSTOM_TOKEN = "TEST_CUSTOM_PAYMENT_TOKEN_2026_WITH_MORE_THAN_THIRTY_TWO_BYTES"


def isolated_sql(statement):
    """Restrict synthetic principal and retry setup to the named test database."""
    command = [
        "docker", "exec", "commerce-tests-db-1", "psql", "-U", "commerce",
        "-d", "commerce_test", "-v", "ON_ERROR_STOP=1", "-Atc",
    ]
    database = subprocess.run(
        command + ["SELECT current_database()"], check=True, capture_output=True, text=True
    )
    assert database.stdout.strip() == "commerce_test"
    result = subprocess.run(
        command + [statement], check=True, capture_output=True, text=True
    )
    return result.stdout.strip()


def seed_explicit_platform_owner(organization_id, buyer_id, platform_user_id):
    assert all(type(value) is int and value > 0 for value in (organization_id, buyer_id, platform_user_id))
    row = isolated_sql(
        "WITH verified AS ("
        "SELECT o.id FROM organizations o "
        "JOIN organization_memberships owner ON owner.organization_id=o.id "
        "JOIN platform_users principal ON principal.id=" + str(platform_user_id) + " "
        "WHERE o.id=" + str(organization_id) + " AND owner.user_id=" + str(buyer_id) + " "
        "AND owner.platform_user_id IS NULL AND owner.role='owner' AND owner.status='active' "
        "AND owner.deleted_at IS NULL AND principal.account_status='active'), inserted AS ("
        "INSERT INTO organization_memberships "
        "(organization_id,user_id,platform_user_id,role,status,version,created_at,updated_at) "
        "SELECT id,NULL," + str(platform_user_id) + ",'owner','active',0,now(),now() FROM verified "
        "RETURNING id) SELECT id FROM inserted"
    )
    assert row.isdigit(), row


def seed_retryable_provisioning(purchase_id, organization_id):
    assert type(purchase_id) is int and purchase_id > 0
    assert type(organization_id) is int and organization_id > 0
    row = isolated_sql(
        "WITH verified AS ("
        "SELECT job.id FROM solution_provisioning job "
        "JOIN solution_purchases purchase ON purchase.id=job.purchase_id "
        "JOIN payments payment ON payment.id=purchase.payment_id "
        "JOIN application_entitlement_grants grant_record ON grant_record.id=job.grant_id "
        "WHERE purchase.id=" + str(purchase_id) + " AND purchase.organization_id=" + str(organization_id) + " "
        "AND payment.status='paid' AND payment.paid_at IS NOT NULL "
        "AND grant_record.source='verified_settlement' AND grant_record.organization_id=purchase.organization_id), "
        "changed AS (UPDATE solution_provisioning SET status='failed',attempts=12,available_at=NULL,"
        "completed_at=NULL,updated_at=now() WHERE id IN (SELECT id FROM verified) RETURNING id) "
        "SELECT id FROM changed"
    )
    assert row.isdigit(), row


def shop_admin():
    login = Client("custom-test").call("POST", "auth/login", {
        "email": "admin@custom-test.demo", "password": "Portfolio2026!",
        "device_name": "Solution wire test",
    })
    assert login["status"] == "succeeded", login
    return Client("custom-test", login["result"]["token"])


def shop_buyer():
    register = Client("custom-test").call("POST", "auth/register", {
        "name": "Solution buyer", "email": f"solution-{uuid.uuid4()}@example.test",
        "password": "Password2026!", "password_confirmation": "Password2026!",
        "device_name": "Solution wire test",
    })
    assert register["status"] == "succeeded", register
    return Client("custom-test", register["result"]["token"]), register["result"]["user"]


def paid_order(buyer, order_id):
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        listing = success(buyer, "GET", "orders")
        current = next(item for item in listing["orders"]["data"] if item["id"] == order_id)
        if current["payment"]["status"] == "paid":
            return current
        time.sleep(0.1)
    raise AssertionError("Verified custom provider event did not settle the solution order")


def confirm_custom_payment(invoice_id):
    assert isinstance(invoice_id, str) and invoice_id
    headers = {"Accept": "application/json", "Authorization": f"Bearer {CUSTOM_TOKEN}",
               "Idempotency-Key": str(uuid.uuid4())}
    with httpx.Client(trust_env=False, timeout=10) as integration:
        accepted = integration.post(
            BASE + "/api/v1/payment-integrations/bank-transfer/confirm",
            json={"invoice_id": invoice_id}, headers=headers,
        )
        assert accepted.status_code == 202, accepted.text
        event_id = accepted.json()["event_id"]
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            result = integration.get(
                BASE + f"/api/v1/payment-integrations/bank-transfer/{event_id}", headers=headers
            )
            assert result.status_code == 200, result.text
            if result.json()["status"] == "processed":
                return
            time.sleep(0.1)
    raise AssertionError("Verified custom provider event was not processed")


def test_all_ten_solution_commands_use_checkout_pinning_and_verified_settlement():
    admin, (buyer, buyer_user) = shop_admin(), shop_buyer()
    product = success(admin, "POST", "admin/products", {
        "name": "CRM solution", "category": "Solutions",
        "description": "Synthetic isolated solution offering",
        "image_url": "https://example.test/solution.png",
        "price": 1200, "stock": 3, "active": True,
    })["product"]
    published = success(admin, "POST", "admin/solutions/offerings", {
        "product_id": product["id"], "application_key": "crm",
        "deliverables": ["CRM workspace"],
    })["offering"]
    offering_id = published["id"]
    guest = Client("custom-test")
    directory = success(guest, "GET", "solutions/offerings?page=1&per_page=50&application_key=crm")
    assert any(item["id"] == offering_id for item in directory["data"])
    assert success(guest, "GET", f"solutions/offerings/{offering_id}")["offering"]["version"] == 1

    organization = success(buyer, "POST", "platform/organizations", {
        "code": "solution-" + uuid.uuid4().hex, "name": "Solution owner",
    })["organization"]
    organization_id = organization["id"]
    cart = success(buyer, "PUT", "cart", {
        "items": [{"product_id": product["id"], "quantity": 1}], "expected_version": 0,
    })
    order = success(buyer, "POST", "checkout", {
        "checkout_key": str(uuid.uuid4()), "shipping_address": address(),
        "payment_method": "bank-transfer", "expected_version": cart["version"],
    })["order"]
    assert order["solution_offering_id"] == offering_id
    assert order["items"][0]["solution_offering_id"] == offering_id
    base = f"platform/organizations/{organization_id}/solution-purchases"
    bound = success(buyer, "POST", base, {"offering_id": offering_id, "order_id": order["id"]})
    purchase_id = bound["purchase_id"]
    purchases = success(buyer, "GET", base + "?page=1&per_page=50")
    assert any(item["id"] == purchase_id for item in purchases["data"])
    assert success(buyer, "GET", base + f"/detail?purchase_id={purchase_id}")["status"] == "awaiting_settlement"

    confirm_custom_payment(order["payment"]["invoice_id"])
    assert paid_order(buyer, order["id"])["payment"]["status"] == "paid"
    seed_retryable_provisioning(purchase_id, organization_id)
    assert success(buyer, "POST", base + "/retry", {"purchase_id": purchase_id})["status"] == "queued"

    platform, platform_user, _ = identity()
    seed_explicit_platform_owner(organization_id, buyer_user["id"], platform_user["id"])
    standalone = f"organizations/{organization_id}/solution-purchases"
    assert any(item["id"] == purchase_id for item in success(platform, "GET", standalone + "?page=1")["data"])
    assert success(platform, "GET", standalone + f"/detail?purchase_id={purchase_id}")["purchase_id"] == purchase_id
    seed_retryable_provisioning(purchase_id, organization_id)
    assert success(platform, "POST", standalone + "/retry", {"purchase_id": purchase_id})["status"] == "queued"
