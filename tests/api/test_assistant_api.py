"""Real PostgreSQL/worker assistant HTTP contract; no mocked model accuracy claims."""

import secrets

from test_worker_api import Client


def test_assistant_discovery_dispatch_and_validation_over_http():
    client = Client(shop="electronics")
    receipt = secrets.token_hex(32)

    def turn(body):
        return client.finish(*client.submit("POST", "assistant", body, receipt=receipt))

    available = turn({"discover": True})
    assert available["status"] == "succeeded", available
    names = {item["name"] for item in available["result"]["available_actions"]}
    assert names == {"catalog", "product", "login", "register"}
    result = turn({"action": "catalog", "data": {"page": 1}})
    assert result["status"] == "succeeded", result
    assert result["result"]["status"] == "completed"
    assert result["result"]["api_result"]["products"]["data"]
    forbidden = turn({"action": "deleteProduct", "data": {"id": 1}})
    assert forbidden["http_status"] == 403
    invalid = turn({"action": "catalog", "data": {"user_id": 99}})
    assert invalid["http_status"] == 422
    assert "validation_error" in invalid["result"]
