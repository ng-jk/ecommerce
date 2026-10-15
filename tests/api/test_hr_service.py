"""Real platform → signed HR inbox → isolated worker → durable receipt flows."""

import subprocess
import uuid
from datetime import datetime, timedelta, timezone

from test_platform_identity import identity, success


def hr_workspace():
    owner, owner_user, _ = identity()
    org = success(owner, "POST", "organizations", {
        "code": "hr-" + uuid.uuid4().hex, "name": "HR integration"
    })["organization"]
    command = ["docker", "exec", "commerce-tests-db-1", "psql", "-U", "commerce", "-d", "commerce_test", "-v", "ON_ERROR_STOP=1", "-Atc"]
    assert subprocess.run(command + ["SELECT current_database()"], check=True, capture_output=True, text=True).stdout.strip() == "commerce_test"
    evidence = "synthetic-hr-wire-" + uuid.uuid4().hex
    subprocess.run(command + [
        ("INSERT INTO application_entitlement_grants (organization_id,application_key,source,evidence_ref,starts_at,created_at,updated_at) "
        f"VALUES ({org['id']},'hr','operator','{evidence}',now()-interval '1 second',now(),now())")
    ], check=True, capture_output=True, text=True)
    prefix = f"organizations/{org['id']}"
    catalog = success(owner, "GET", prefix + "/application-catalog?application_key=hr&per_page=1")
    assert catalog["data"][0]["available"] and catalog["data"][0]["entitled"]
    installed = success(owner, "POST", prefix + "/applications/hr/install", {"expected_version": 0})["application"]
    return owner, owner_user, prefix, prefix + "/hr", installed


def hr_member(owner, prefix):
    client, user, _ = identity()
    invited = success(owner, "POST", prefix + "/memberships", {"platform_user_id": user["id"], "role": "member"})["membership"]
    accepted = success(client, "POST", prefix + f"/memberships/{invited['id']}/accept", {"expected_version": invited["version"]})["membership"]
    assert accepted["status"] == "active"
    return client, user, accepted


def offset(moment):
    return moment.isoformat(timespec="seconds")


def test_hr_all_seventeen_commands_current_owner_and_employee_scope():
    owner, _, prefix, hr, installed = hr_workspace()
    worker, worker_user, membership = hr_member(owner, prefix)
    outsider, _, _ = hr_member(owner, prefix)
    employee = success(owner, "POST", hr + "/employees", {
        "code": "staff-one", "display_name": "Maya", "timezone": "Asia/Kuala_Lumpur",
        "linked_platform_user_id": worker_user["id"],
    })["employee"]
    assert success(owner, "GET", hr + "/employees?status=active&per_page=1")["data"][0]["id"] == employee["id"]
    assert success(owner, "GET", hr + f"/owner/employees/{employee['id']}")["employee"]["id"] == employee["id"]
    assert success(worker, "GET", hr + "/employees/me")["employee"]["id"] == employee["id"]
    assert outsider.call("GET", hr + "/employees/me")["http_status"] == 404
    assert worker.call("GET", hr + "/employees")["http_status"] == 403
    changed = success(owner, "PATCH", hr + f"/employees/{employee['id']}", {
        "display_name": "Maya Updated", "timezone": "Asia/Kuala_Lumpur", "status": "active",
        "expected_version": employee["version"],
    })["employee"]
    assert changed["version"] == employee["version"] + 1

    start = datetime.now(timezone.utc) - timedelta(hours=8)
    end = datetime.now(timezone.utc) - timedelta(hours=7)
    attendance = success(worker, "POST", hr + "/attendance", {
        "started_at": offset(start), "ended_at": offset(end),
    })["attendance"]
    assert success(worker, "GET", hr + "/attendance?per_page=1")["data"][0]["id"] == attendance["id"]
    assert success(owner, "GET", hr + f"/employees/{employee['id']}/attendance?per_page=1")["meta"]["total"] == 1
    assert outsider.call("GET", hr + f"/employees/{employee['id']}/attendance")["http_status"] == 403
    corrected = success(owner, "POST", hr + f"/attendance/{attendance['id']}/correct", {
        "started_at": offset(start), "ended_at": offset(end + timedelta(minutes=10)),
        "reason": "Approved correction", "expected_version": attendance["version"],
    })
    assert corrected["attendance"]["version"] == attendance["version"] + 1
    assert corrected["correction"]["corrected_by_platform_user_id"] > 0
    assert owner.call("POST", hr + f"/attendance/{attendance['id']}/correct", {
        "started_at": offset(start), "ended_at": offset(end), "reason": "Stale",
        "expected_version": attendance["version"],
    })["http_status"] == 409

    leave_type = success(owner, "POST", hr + "/leave-types", {
        "code": "annual", "name": "Annual", "allowance_days": 10,
    })["leave_type"]
    assert success(worker, "GET", hr + "/leave-types?status=active&per_page=1")["data"][0]["id"] == leave_type["id"]
    future = datetime.now(timezone.utc) + timedelta(days=10)
    from_day = future.date().isoformat()
    to_day = (future + timedelta(days=1)).date().isoformat()
    leave = success(worker, "POST", hr + "/leave", {
        "leave_type_id": leave_type["id"], "start_date": from_day, "end_date": to_day,
    })["leave"]
    assert leave["calendar_days"] == 2
    assert success(worker, "GET", hr + "/leave?status=pending&per_page=1")["data"][0]["id"] == leave["id"]
    assert success(worker, "GET", hr + f"/leave/{leave['id']}")["leave"]["id"] == leave["id"]
    assert outsider.call("GET", hr + f"/leave/{leave['id']}")["http_status"] == 404
    assert success(owner, "GET", hr + f"/owner/leave?employee_id={employee['id']}&per_page=1")["meta"]["total"] == 1
    assert success(owner, "GET", hr + f"/owner/leave/{leave['id']}")["leave"]["id"] == leave["id"]
    decided = success(owner, "POST", hr + f"/owner/leave/{leave['id']}/decide", {
        "decision": "approved", "expected_version": leave["version"],
    })["leave"]
    assert decided["status"] == "approved" and decided["version"] == leave["version"] + 1
    assert worker.call("POST", hr + f"/owner/leave/{leave['id']}/decide", {
        "decision": "rejected", "expected_version": decided["version"],
    })["http_status"] == 403

    revoked = success(owner, "POST", prefix + f"/memberships/{membership['id']}/revoke", {
        "expected_version": membership["version"],
    })["membership"]
    assert revoked["status"] == "revoked"
    assert worker.call("GET", hr + "/attendance")["http_status"] == 403
    disabled = success(owner, "POST", prefix + "/applications/hr/disable", {
        "expected_version": installed["version"],
    })["application"]
    assert owner.call("GET", hr + "/employees")["http_status"] == 403
    success(owner, "POST", prefix + "/applications/hr/reenable", {"expected_version": disabled["version"]})


def test_hr_rejects_forged_target_unknown_fields_and_cross_org_reference():
    owner, owner_user, prefix, hr, _ = hr_workspace()
    worker, worker_user, _ = hr_member(owner, prefix)
    fake = owner.call("POST", hr + "/employees", {
        "code": "fake", "display_name": "Fake", "timezone": "UTC",
        "linked_platform_user_id": 99999999,
    })
    assert fake["http_status"] in {403, 404}
    unknown = owner.call("POST", hr + "/employees", {
        "code": "unknown", "display_name": "Unknown", "timezone": "UTC",
        "linked_platform_user_id": worker_user["id"], "organization_id": 1,
    })
    assert unknown["http_status"] == 422 and "organization_id" in unknown["result"]["validation_error"]
    employee = success(owner, "POST", hr + "/employees", {
        "code": "self-owner", "display_name": "Owner", "timezone": "UTC", "linked_platform_user_id": owner_user["id"],
    })["employee"]
    leave_type = success(owner, "POST", hr + "/leave-types", {
        "code": "short", "name": "Short", "allowance_days": 1,
    })["leave_type"]
    day = (datetime.now(timezone.utc) + timedelta(days=7)).date().isoformat()
    leave = success(owner, "POST", hr + "/leave", {
        "leave_type_id": leave_type["id"], "start_date": day, "end_date": day,
    })["leave"]
    self_approval = owner.call("POST", hr + f"/owner/leave/{leave['id']}/decide", {
        "decision": "approved", "expected_version": leave["version"],
    })
    assert self_approval["http_status"] == 403
    assert success(owner, "GET", hr + f"/owner/employees/{employee['id']}")["employee"]["id"] == employee["id"]
    assert worker.call("GET", hr + f"/leave/{leave['id']}")["http_status"] == 404
