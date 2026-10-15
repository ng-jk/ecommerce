"""Shop-independent identity and membership wire tests against isolated PostgreSQL."""

import secrets
import uuid

from test_worker_api import Client, customer


class PlatformClient(Client):
    def submit(self, method, path, body=None, key=None, receipt=None):
        headers = {"Idempotency-Key": key or str(uuid.uuid4()), "X-Operation-Token": receipt or secrets.token_hex(32)}
        response = self.http.request(method, f"http://localhost:8088/api/v1/platform/{path}", json=body, headers=headers)
        return response, headers


def identity():
    credentials = {"name": "Platform wire user", "email": f"{uuid.uuid4()}@example.test", "password": "Password2026!", "device_name": "wire test"}
    registered = PlatformClient().call("POST", "auth/register", {**credentials, "password_confirmation": credentials["password"]})
    assert registered["status"] == "succeeded", registered
    client = PlatformClient(token=registered["result"]["token"])
    return client, registered["result"]["user"], credentials


def success(client, method, path, body=None):
    result = client.call(method, path, body)
    assert result["status"] == "succeeded", result
    return result["result"]


def membership_flow(owner, recipient, target_field, organization_path):
    if isinstance(recipient, PlatformClient):
        recipient_user = success(recipient, "GET", "auth/me")["user"]
    else:
        response = recipient.http.get(f"http://localhost:8088/api/v1/shops/{recipient.shop}/auth/me")
        assert response.status_code == 200
        recipient_user = response.json()["user"]
    org = success(owner, "POST", organization_path, {"code": "members-" + uuid.uuid4().hex, "name": "Membership wire test"})["organization"]
    path = f"{organization_path}/{org['id']}"
    directory = success(owner, "GET", path + "/memberships?page=1&per_page=1&status=active&role=owner")
    assert directory["meta"]["can_manage"] is True and len(directory["data"]) == 1
    only_owner = directory["data"][0]
    blocked = owner.call("POST", f"{path}/memberships/{only_owner['id']}/revoke", {"expected_version": only_owner["version"]})
    assert blocked["http_status"] == 409
    invited = success(owner, "POST", path + "/memberships", {target_field: recipient_user["id"], "role": "member"})["membership"]
    member_path = f"{path}/memberships/{invited['id']}"
    assert success(recipient, "GET", member_path)["membership"]["status"] == "invited"
    active = success(recipient, "POST", member_path + "/accept", {"expected_version": invited["version"]})["membership"]
    updated = success(owner, "PATCH", member_path, {"role": "admin", "expected_version": active["version"]})["membership"]
    stale = owner.call("PATCH", member_path, {"role": "owner", "expected_version": active["version"]})
    assert stale["http_status"] == 409
    success(owner, "POST", member_path + "/revoke", {"expected_version": updated["version"]})
    denied = recipient.call("GET", member_path)
    assert denied["http_status"] == 404
    return org


def test_platform_identity_workspace_and_memberships_without_shop():
    owner, user, credentials = identity()
    recipient, _, _ = identity()
    assert success(owner, "GET", "auth/me")["user"] == user
    org = membership_flow(owner, recipient, "platform_user_id", "organizations")
    identifier = org["id"]
    assert success(owner, "GET", "organizations?page=1&status=active")["meta"]["total"] >= 1
    detail = success(owner, "GET", f"organizations/{identifier}")
    assert detail["organization"]["id"] == identifier
    renamed = success(owner, "PATCH", f"organizations/{identifier}", {"name": "Standalone workspace", "expected_version": detail["organization"]["version"]})
    assert renamed["organization"]["name"] == "Standalone workspace"
    applications = success(owner, "GET", f"organizations/{identifier}/applications?page=1")
    assert [item["application_key"] for item in applications["data"]] == ["framework"]
    foreign = PlatformClient()
    foreign.http.headers["Authorization"] = customer().http.headers["Authorization"]
    forbidden, _ = foreign.submit("GET", "organizations")
    assert forbidden.status_code == 403
    invalid = owner.call("POST", "organizations", {"code": "forged-" + uuid.uuid4().hex, "name": "Forged", "owner_id": 999})
    assert invalid["http_status"] == 422
    success(owner, "POST", "auth/logout", {})
    revoked, _ = owner.submit("GET", "auth/me")
    assert revoked.status_code == 401
    login = success(PlatformClient(), "POST", "auth/login", {key: credentials[key] for key in ("email", "password", "device_name")})
    assert login["user"]["id"] == user["id"]


def test_legacy_membership_commands_keep_shop_scope():
    membership_flow(customer(), customer(), "user_id", "platform/organizations")
