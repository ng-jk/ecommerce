"""CRM-02 real API flows through the isolated signed CRM service."""

import uuid

from test_crm_service import workspace
from test_platform_identity import identity, success


def test_growth_pipeline_stage_deal_activity_commands_and_version_guards():
    owner, prefix, _ = workspace()
    crm = prefix + "/crm"
    pipeline = success(owner, "POST", crm + "/pipelines", {
        "code": "sales-" + uuid.uuid4().hex[:8], "name": "Sales",
    })["pipeline"]
    assert success(owner, "GET", crm + f"/pipelines?code={pipeline['code']}&per_page=1")["data"] == [pipeline]
    assert success(owner, "GET", crm + f"/pipelines/{pipeline['id']}")["pipeline"] == pipeline
    renamed = success(owner, "PATCH", crm + f"/pipelines/{pipeline['id']}", {
        "name": "Enterprise sales", "expected_version": pipeline["version"],
    })["pipeline"]
    assert renamed["version"] == pipeline["version"] + 1

    def stage(code, position, outcome):
        return success(owner, "POST", crm + "/stages", {
            "pipeline_id": pipeline["id"], "code": code, "name": code.title(),
            "position": position, "outcome": outcome,
        })["stage"]

    intake = stage("intake", 10, "open")
    proposal = stage("proposal", 20, "open")
    won = stage("won", 30, "won")
    stages = success(owner, "GET", crm + f"/stages?pipeline_id={pipeline['id']}&outcome=open&per_page=2")
    assert [row["id"] for row in stages["data"]] == [intake["id"], proposal["id"]]
    assert stages["meta"]["options"]["outcome"]["won"] == "Won"
    assert success(owner, "GET", crm + f"/stages/{intake['id']}")["stage"] == intake
    changed_stage = success(owner, "PATCH", crm + f"/stages/{intake['id']}", {
        "name": "Discovery", "expected_version": intake["version"],
    })["stage"]
    assert changed_stage["version"] == intake["version"] + 1

    company = success(owner, "POST", crm + "/companies", {"code": "buyer-" + uuid.uuid4().hex[:8], "name": "Buyer"})["company"]
    deal_input = {
        "pipeline_id": pipeline["id"], "stage_id": intake["id"], "title": "Renewal",
        "company_id": company["id"], "contact_id": None, "assignee_platform_user_id": None,
        "amount_minor": 2550, "currency": "USD",
    }
    deal = success(owner, "POST", crm + "/deals", deal_input)["deal"]
    assert type(deal["amount_minor"]) is int and deal["amount_minor"] == 2550
    assert deal["status"] == "open" and "organization_id" not in deal
    deals = success(owner, "GET", crm + f"/deals?pipeline_id={pipeline['id']}&stage_id={intake['id']}&per_page=1")
    assert deals["data"] == [deal] and deals["meta"]["options"]["status"]["open"] == "Open"
    assert success(owner, "GET", crm + f"/deals/{deal['id']}")["deal"] == deal
    changed = success(owner, "PATCH", crm + f"/deals/{deal['id']}", {
        "title": "Renewal 2027", "company_id": company["id"], "contact_id": None,
        "assignee_platform_user_id": None, "amount_minor": 3000, "currency": "MYR",
        "expected_version": deal["version"],
    })["deal"]
    assert changed["amount_minor"] == 3000 and changed["version"] == deal["version"] + 1
    forward = success(owner, "POST", crm + f"/deals/{deal['id']}/advance", {
        "stage_id": proposal["id"], "expected_version": changed["version"],
    })["deal"]
    assert forward["status"] == "open" and forward["stage_id"] == proposal["id"]
    assert owner.call("POST", crm + f"/deals/{deal['id']}/advance", {
        "stage_id": intake["id"], "expected_version": forward["version"],
    })["http_status"] == 409
    assert owner.call("POST", crm + f"/deals/{deal['id']}/advance", {
        "stage_id": won["id"], "expected_version": changed["version"],
    })["http_status"] == 409
    closed = success(owner, "POST", crm + f"/deals/{deal['id']}/advance", {
        "stage_id": won["id"], "expected_version": forward["version"],
    })["deal"]
    assert closed["status"] == "won"
    assert owner.call("PATCH", crm + f"/deals/{deal['id']}", {
        "title": "Forbidden edit", "company_id": None, "contact_id": None,
        "assignee_platform_user_id": None, "amount_minor": 1, "currency": "USD",
        "expected_version": closed["version"],
    })["http_status"] == 409

    activity = success(owner, "POST", crm + "/activities", {
        "deal_id": deal["id"], "type": "call", "summary": "Reached buyer",
        "occurred_at": "2026-10-13T10:00:00+00:00",
    })["activity"]
    assert activity["deal_id"] == deal["id"] and "created_by_platform_user_id" not in activity
    activities = success(owner, "GET", crm + f"/activities?deal_id={deal['id']}&type=call&per_page=1")
    assert activities["data"] == [activity] and activities["meta"]["options"]["type"]["call"] == "Call"
    assert success(owner, "GET", crm + f"/activities/{activity['id']}")["activity"] == activity


def test_growth_assignment_requires_current_member_and_foreign_references_fail_closed():
    owner, prefix, _ = workspace()
    crm = prefix + "/crm"
    target, target_user, _ = identity()
    outsider, outsider_user, _ = identity()
    pipeline = success(owner, "POST", crm + "/pipelines", {
        "code": "assign-" + uuid.uuid4().hex[:8], "name": "Assignments",
    })["pipeline"]
    stage = success(owner, "POST", crm + "/stages", {
        "pipeline_id": pipeline["id"], "code": "intake", "name": "Intake",
        "position": 10, "outcome": "open",
    })["stage"]
    input_data = {
        "pipeline_id": pipeline["id"], "stage_id": stage["id"], "title": "Assigned",
        "company_id": None, "contact_id": None, "assignee_platform_user_id": outsider_user["id"],
        "amount_minor": 0, "currency": "USD",
    }
    assert owner.call("POST", crm + "/deals", input_data)["http_status"] == 403
    invitation = success(owner, "POST", prefix + "/memberships", {
        "platform_user_id": target_user["id"], "role": "member",
    })["membership"]
    active = success(target, "POST", prefix + f"/memberships/{invitation['id']}/accept", {
        "expected_version": invitation["version"],
    })["membership"]
    assert active["status"] == "active"
    deal = success(owner, "POST", crm + "/deals", {
        **input_data, "assignee_platform_user_id": target_user["id"],
    })["deal"]
    assert deal["assignee_platform_user_id"] == target_user["id"]
    success(owner, "POST", prefix + f"/memberships/{invitation['id']}/revoke", {
        "expected_version": active["version"],
    })
    assert owner.call("PATCH", crm + f"/deals/{deal['id']}", {
        "title": "Still assigned", "company_id": None, "contact_id": None,
        "assignee_platform_user_id": target_user["id"], "amount_minor": 0,
        "currency": "USD", "expected_version": deal["version"],
    })["http_status"] == 403
    cleared = success(owner, "PATCH", crm + f"/deals/{deal['id']}", {
        "title": "Unassigned", "company_id": None, "contact_id": None,
        "assignee_platform_user_id": None, "amount_minor": 0,
        "currency": "USD", "expected_version": deal["version"],
    })["deal"]
    assert cleared["assignee_platform_user_id"] is None
    foreign_owner, foreign_prefix, _ = workspace()
    foreign_crm = foreign_prefix + "/crm"
    foreign_stage = success(foreign_owner, "POST", foreign_crm + "/pipelines", {
        "code": "foreign-" + uuid.uuid4().hex[:8], "name": "Foreign",
    })["pipeline"]
    foreign_stage = success(foreign_owner, "POST", foreign_crm + "/stages", {
        "pipeline_id": foreign_stage["id"], "code": "foreign", "name": "Foreign",
        "position": 10, "outcome": "open",
    })["stage"]
    assert owner.call("POST", crm + "/deals", {
        **input_data, "stage_id": foreign_stage["id"], "assignee_platform_user_id": None,
    })["http_status"] == 404
    assert outsider.call("GET", crm + "/deals")["http_status"] in {403, 404}
