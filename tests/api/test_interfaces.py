"""Python interface against the isolated Laravel/PostgreSQL/worker stack."""

import os
import uuid

from shop3i import AssistantClient


def test_python_sdk_discovery_read_and_separate_write_confirmation():
    client = AssistantClient(os.getenv("SHOP3I_TEST_BASE_URL", "http://localhost:8088"), "fashion")
    discovered = client.discover()
    assert discovered["role"] == "guest"
    assert "catalog" in {action["name"] for action in discovered["available_actions"]}
    catalog = client.invoke("catalog", {"page": 1})
    assert catalog["status"] == "completed"
    assert catalog["api_result"]["products"]["data"]
    registration = client.invoke("register", {
        "name": "Python interface test", "email": f"python-{uuid.uuid4().hex}@example.test",
        "password": "Password2026!", "password_confirmation": "Password2026!",
        "device_name": "Python interface test"})
    assert registration["status"] == "needs_confirmation"
    completed = client.confirm(registration)
    assert completed["status"] == "completed"
    assert completed["api_result"]["user"]["role"] == "customer"
