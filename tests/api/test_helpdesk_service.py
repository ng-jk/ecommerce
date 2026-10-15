"""Real standalone platform→signed inbox→isolated Helpdesk worker→platform receipt flows."""

import subprocess
import uuid

from test_platform_identity import identity, success


def grant_test_helpdesk(organization_id):
    """Only the explicitly named disposable integration database receives this trusted fixture."""
    assert type(organization_id) is int and organization_id > 0
    command = ["docker", "exec", "commerce-tests-db-1", "psql", "-U", "commerce", "-d", "commerce_test", "-v", "ON_ERROR_STOP=1", "-Atc"]
    assert subprocess.run(command + ["SELECT current_database()"], check=True, capture_output=True, text=True).stdout.strip() == "commerce_test"
    evidence = "synthetic-helpdesk-wire-" + uuid.uuid4().hex
    subprocess.run(command + [
        "INSERT INTO application_entitlement_grants (organization_id,application_key,source,evidence_ref,starts_at,created_at,updated_at) "
        f"VALUES ({organization_id},'helpdesk','operator','{evidence}',now()-interval '1 second',now(),now())"
    ], check=True, capture_output=True, text=True)


def workspace():
    owner, owner_user, _ = identity()
    organization = success(owner, "POST", "organizations", {
        "code": "helpdesk-" + uuid.uuid4().hex, "name": "Helpdesk integration"
    })["organization"]
    grant_test_helpdesk(organization["id"])
    prefix = f"organizations/{organization['id']}"
    catalog = success(owner, "GET", prefix + "/application-catalog?application_key=helpdesk&per_page=1")
    assert catalog["data"][0]["entitled"] is True
    assert catalog["data"][0]["available"] is True
    installed = success(owner, "POST", prefix + "/applications/helpdesk/install", {"expected_version": 0})
    assert installed["application"]["state"] == "installed"
    return owner, owner_user, prefix, installed


def member(owner, prefix):
    client, user, _ = identity()
    invited = success(owner, "POST", prefix + "/memberships", {
        "platform_user_id": user["id"], "role": "member"
    })["membership"]
    accepted = success(client, "POST", prefix + f"/memberships/{invited['id']}/accept", {
        "expected_version": invited["version"]
    })["membership"]
    assert accepted["status"] == "active"
    return client, user, accepted


def test_helpdesk_all_seventeen_commands_and_current_visibility():
    owner, _, prefix, installed = workspace()
    requester, requester_user, _ = member(owner, prefix)
    agent_client, agent_user, _ = member(owner, prefix)
    other_requester, _, _ = member(owner, prefix)
    helpdesk = prefix + "/helpdesk"

    queue = success(owner, "POST", helpdesk + "/queues", {
        "code": "general", "name": "General"
    })["queue"]
    assert success(owner, "GET", helpdesk + "/queues?status=active&per_page=1")["data"] == [queue]
    assert success(owner, "GET", helpdesk + f"/queues/{queue['id']}")["queue"] == queue
    updated_queue = success(owner, "PATCH", helpdesk + f"/queues/{queue['id']}", {
        "name": "Support", "status": "active", "expected_version": queue["version"]
    })["queue"]
    assert updated_queue["version"] == queue["version"] + 1

    agent = success(owner, "POST", helpdesk + "/agents", {
        "queue_id": queue["id"], "target_platform_user_id": agent_user["id"]
    })["agent"]
    assert agent["platform_user_id"] == agent_user["id"]
    assert success(owner, "GET", helpdesk + f"/agents?queue_id={queue['id']}&status=active&per_page=1")["data"] == [agent]

    ticket = success(requester, "POST", helpdesk + "/tickets", {
        "queue_id": queue["id"], "subject": "Need help", "description": "My issue"
    })["ticket"]
    assert "requester_platform_user_id" not in ticket
    requester_summary = success(requester, "GET", helpdesk + f"/tickets?queue_id={queue['id']}&status=open&per_page=1")["data"]
    assert requester_summary[0]["id"] == ticket["id"] and "description" not in requester_summary[0]
    assert success(requester, "GET", helpdesk + f"/tickets/{ticket['id']}")["ticket"] == ticket
    assert success(other_requester, "GET", helpdesk + "/tickets")["meta"]["total"] == 0
    hidden = other_requester.call("GET", helpdesk + f"/tickets/{ticket['id']}")
    assert hidden["http_status"] == 404
    agent_summary = success(agent_client, "GET", helpdesk + f"/agent/tickets?queue_id={queue['id']}&per_page=1")
    assert agent_summary["meta"]["total"] == 1 and "description" not in agent_summary["data"][0]
    agent_detail = success(agent_client, "GET", helpdesk + f"/agent/tickets/{ticket['id']}")["ticket"]
    assert agent_detail["requester_platform_user_id"] == requester_user["id"]
    owner_summary = success(owner, "GET", helpdesk + f"/owner/tickets?status=open&per_page=1")
    assert owner_summary["meta"]["total"] == 1 and "description" not in owner_summary["data"][0]
    assert success(owner, "GET", helpdesk + f"/owner/tickets/{ticket['id']}")["ticket"]["id"] == ticket["id"]

    assigned = success(owner, "POST", helpdesk + f"/owner/tickets/{ticket['id']}/assign", {
        "assigned_platform_user_id": agent_user["id"], "expected_version": ticket["version"]
    })["ticket"]
    assert assigned["assigned_platform_user_id"] == agent_user["id"]
    pending = success(agent_client, "POST", helpdesk + f"/agent/tickets/{ticket['id']}/status", {
        "status": "pending", "expected_version": assigned["version"]
    })["ticket"]
    assert pending["status"] == "pending"
    resolved = success(owner, "POST", helpdesk + f"/owner/tickets/{ticket['id']}/status", {
        "status": "resolved", "expected_version": pending["version"]
    })["ticket"]
    assert resolved["status"] == "resolved"
    closed = success(owner, "POST", helpdesk + f"/owner/tickets/{ticket['id']}/status", {
        "status": "closed", "expected_version": resolved["version"]
    })["ticket"]
    assert closed["status"] == "closed"
    stale = owner.call("POST", helpdesk + f"/owner/tickets/{ticket['id']}/status", {
        "status": "open", "expected_version": resolved["version"]
    })
    assert stale["http_status"] == 409

    revoked = success(owner, "POST", helpdesk + f"/agents/{agent['id']}/revoke", {
        "expected_version": agent["version"]
    })["agent"]
    assert revoked["status"] == "revoked"
    assert success(agent_client, "GET", helpdesk + "/agent/tickets")["meta"]["total"] == 0
    no_roster = agent_client.call("GET", helpdesk + f"/agent/tickets/{ticket['id']}")
    assert no_roster["http_status"] == 404
    still_owner = success(owner, "GET", helpdesk + f"/owner/tickets/{ticket['id']}")["ticket"]
    assert still_owner["status"] == "closed"
    disabled = success(owner, "POST", prefix + "/applications/helpdesk/disable", {
        "expected_version": installed["application"]["version"]
    })
    denied = owner.call("GET", helpdesk + "/queues")
    assert denied["http_status"] == 403
    success(owner, "POST", prefix + "/applications/helpdesk/reenable", {
        "expected_version": disabled["application"]["version"]
    })


def test_helpdesk_foreign_or_inactive_agent_target_and_cross_organization_are_denied():
    owner, _, prefix, _ = workspace()
    helpdesk = prefix + "/helpdesk"
    queue = success(owner, "POST", helpdesk + "/queues", {"code": "general", "name": "General"})["queue"]
    foreign, foreign_user, _ = identity()
    success(foreign, "POST", "organizations", {
        "code": "foreign-" + uuid.uuid4().hex, "name": "Foreign workspace"
    })
    inactive, inactive_user, _ = identity()
    for target in (foreign_user, inactive_user):
        denied = owner.call("POST", helpdesk + "/agents", {
            "queue_id": queue["id"], "target_platform_user_id": target["id"]
        })
        assert denied["http_status"] == 403, denied
    denied = foreign.call("GET", helpdesk + "/queues")
    assert denied["http_status"] in {403, 404}
    invalid = owner.call("POST", helpdesk + "/queues", {
        "code": "other", "name": "Other", "organization_id": 999
    })
    assert invalid["http_status"] == 422 and "organization_id" in invalid["result"]["validation_error"]
