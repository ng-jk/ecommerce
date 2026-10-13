"""Framework workspace wire contracts against the isolated worker stack."""

import uuid

from test_worker_api import Client, admin, customer


def workspace(client):
    result = client.call("POST", "platform/organizations", {
        "code": "workspace-" + uuid.uuid4().hex,
        "name": "Workspace wire test",
    })
    assert result["status"] == "succeeded", result
    assert result["result"]["can_update"] is True
    return result["result"]["organization"]


def test_workspace_commands_pagination_versions_and_metadata():
    owner = customer()
    organization = workspace(owner)
    identifier = organization["id"]
    listing = owner.call("GET", "platform/organizations?page=1&per_page=1&status=active")
    assert listing["status"] == "succeeded", listing
    assert set(listing["result"]) == {"data", "meta"}
    assert listing["result"]["meta"]["per_page"] == 1
    assert "active" in listing["result"]["meta"]["options"]["status"]
    detail = owner.call("GET", f"platform/organizations/{identifier}")
    assert detail["result"]["organization"] == organization
    assert set(organization) == {"id", "code", "name", "status", "version"}
    applications = owner.call("GET", f"platform/organizations/{identifier}/applications?page=1")
    assert applications["status"] == "succeeded", applications
    assert set(applications["result"]) == {"data", "meta"}
    assert [app["application_key"] for app in applications["result"]["data"]] == ["framework"]
    updated = owner.call("PATCH", f"platform/organizations/{identifier}", {
        "name": "Renamed workspace", "expected_version": organization["version"],
    })
    assert updated["status"] == "succeeded", updated
    assert updated["result"]["organization"]["version"] == organization["version"] + 1
    stale = owner.call("PATCH", f"platform/organizations/{identifier}", {
        "name": "Stale overwrite", "expected_version": organization["version"],
    })
    assert stale["status"] == "rejected" and stale["http_status"] == 409
    current = owner.call("GET", f"platform/organizations/{identifier}")
    assert current["result"]["organization"]["name"] == "Renamed workspace"


def test_workspace_direct_requests_cannot_forge_ownership_or_bypass_scope():
    owner = customer()
    organization = workspace(owner)
    target = f"platform/organizations/{organization['id']}"
    for stranger in (customer(), admin()):
        rejected = stranger.call("GET", target)
        assert rejected["status"] == "rejected" and rejected["http_status"] == 404
        update = stranger.call("PATCH", target, {"name": "Hijacked", "expected_version": 0})
        assert update["status"] == "rejected" and update["http_status"] == 404
    guest, _ = Client().submit("GET", "platform/organizations")
    assert guest.status_code == 401
    forged = owner.call("POST", "platform/organizations", {
        "code": "forged-" + uuid.uuid4().hex, "name": "Forged", "user_id": 999,
    })
    assert forged["status"] == "rejected" and forged["http_status"] == 422
    assert "user_id" in forged["result"]["validation_error"]
    for suffix in ("?page=0", "?per_page=51", "?status=unknown", "?filter=name"):
        invalid = owner.call("GET", "platform/organizations" + suffix)
        assert invalid["status"] == "rejected" and invalid["http_status"] == 422


def test_workspace_idempotency_and_ai_confirmation_use_same_authority():
    owner = customer()
    key = str(uuid.uuid4())
    receipt = uuid.uuid4().hex + uuid.uuid4().hex
    body = {"code": "replay-" + uuid.uuid4().hex, "name": "Replay workspace"}
    first_response, headers = owner.submit("POST", "platform/organizations", body, key, receipt)
    first = owner.finish(first_response, headers)
    replay_response, replay_headers = owner.submit("POST", "platform/organizations", body, key, receipt)
    replay = owner.finish(replay_response, replay_headers)
    assert first["operation_id"] == replay["operation_id"]
    changed, _ = owner.submit("POST", "platform/organizations", {**body, "name": "Changed"}, key, receipt)
    assert changed.status_code == 409
    preview_response, preview_headers = owner.submit("POST", "assistant", {
        "action": "updateOrganization", "data": {"id": first["result"]["organization"]["id"], "name": "AI renamed"},
    })
    preview = owner.finish(preview_response, preview_headers)
    assert preview["status"] == "succeeded", preview
    draft = preview["result"]
    assert draft["status"] == "needs_confirmation"
    # Conversation receipts stay the same across turns; business idempotency keys change.
    confirm_response, confirm_headers = owner.submit("POST", "assistant", {
        "conversation_id": draft["conversation_id"], "conversation_version": draft["conversation_version"], "confirm": True,
    }, receipt=headers["X-Operation-Token"])
    # The preview used its own receipt, so this deliberately rejects an unrelated receipt.
    denied = owner.finish(confirm_response, confirm_headers)
    assert denied["status"] == "rejected" and denied["http_status"] == 404
    completed = owner.finish(*owner.submit("POST", "assistant", {
        "conversation_id": draft["conversation_id"], "conversation_version": draft["conversation_version"], "confirm": True,
    }, receipt=preview_headers["X-Operation-Token"]))
    assert completed["status"] == "succeeded", completed
    assert completed["result"]["executed_action"] == "platform.organization.update"
    assert completed["result"]["api_result"]["organization"]["name"] == "AI renamed"
