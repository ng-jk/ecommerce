"""Real platform → signed Insights inbox → isolated worker → durable receipt flows."""

import subprocess
import uuid

from test_platform_identity import identity, success


def grant_test_insights(organization_id):
    assert type(organization_id) is int and organization_id > 0
    command = ["docker", "exec", "commerce-tests-db-1", "psql", "-U", "commerce", "-d", "commerce_test", "-v", "ON_ERROR_STOP=1", "-Atc"]
    assert subprocess.run(command + ["SELECT current_database()"], check=True, capture_output=True, text=True).stdout.strip() == "commerce_test"
    evidence = "synthetic-insights-wire-" + uuid.uuid4().hex
    subprocess.run(command + [
        ("INSERT INTO application_entitlement_grants (organization_id,application_key,source,evidence_ref,starts_at,created_at,updated_at) "
        f"VALUES ({organization_id},'insights','operator','{evidence}',now()-interval '1 second',now(),now())")
    ], check=True, capture_output=True, text=True)


def insights_workspace():
    owner, _, _ = identity()
    organization = success(owner, "POST", "organizations", {
        "code": "insights-" + uuid.uuid4().hex, "name": "Insights integration"
    })["organization"]
    grant_test_insights(organization["id"])
    prefix = f"organizations/{organization['id']}"
    catalog = success(owner, "GET", prefix + "/application-catalog?application_key=insights&per_page=1")
    assert catalog["data"][0]["entitled"] is True
    assert catalog["data"][0]["available"] is True
    installed = success(owner, "POST", prefix + "/applications/insights/install", {"expected_version": 0})["application"]
    return owner, prefix, prefix + "/insights", installed



def test_insights_all_sixteen_commands_freshness_and_access():
    owner, prefix, base, _ = insights_workspace()
    dataset = success(owner, "POST", base + "/datasets", {
        "name": "Manual totals", "visibility": "private", "schema": [
            {"name": "team", "type": "string"}, {"name": "value", "type": "integer"}
        ]
    })["resource"]
    path = base + f"/datasets/{dataset['id']}"
    assert success(owner, "GET", base + "/datasets?page=1&per_page=1")["data"][0]["id"] == dataset["id"]
    assert success(owner, "GET", path)["resource"]["source_kind"] == "manual"
    dataset = success(owner, "PUT", path, {"name": "Updated", "visibility": "private", "status": "active", "expected_version": dataset["version"]})["resource"]
    dataset = success(owner, "POST", path + "/rows", {"expected_version": dataset["version"], "rows": [{"team": "A", "value": 3}, {"team": "A", "value": 4}]})["resource"]
    definition = {"metric": {"aggregate": "avg", "column": "value"}, "group_by": "team"}
    output = success(owner, "POST", path + "/query", {"definition": definition})
    assert output["data"][0]["value"] == {"numerator": 7, "denominator": 2}
    assert output["freshness"]["dataset_version"] == dataset["version"]
    report = success(owner, "POST", base + "/reports", {"name": "Average", "visibility": "organization", "dataset_id": dataset["id"], "definition": definition})["resource"]
    report_path = base + f"/reports/{report['id']}"
    assert success(owner, "GET", base + "/reports?page=1&per_page=1")["data"][0]["id"] == report["id"]
    assert success(owner, "GET", report_path)["resource"]["definition"] == definition
    report = success(owner, "PUT", report_path, {"name": "Average updated", "visibility": "organization", "status": "active", "expected_version": report["version"], "definition": definition})["resource"]
    assert success(owner, "POST", report_path + "/run", {})["data"] == output["data"]
    dashboard = success(owner, "POST", base + "/dashboards", {"name": "Board", "visibility": "organization", "report_ids": [report["id"]]})["resource"]
    dashboard_path = base + f"/dashboards/{dashboard['id']}"
    assert success(owner, "GET", base + "/dashboards?page=1&per_page=1")["data"][0]["id"] == dashboard["id"]
    assert success(owner, "GET", dashboard_path)["resource"]["report_ids"] == [report["id"]]
    dashboard = success(owner, "PUT", dashboard_path, {"name": "Board updated", "visibility": "organization", "status": "active", "expected_version": dashboard["version"], "report_ids": [report["id"]]})["resource"]
    assert success(owner, "POST", dashboard_path + "/render", {})["reports"][0]["data"] == output["data"]
    stale = owner.call("POST", path + "/rows", {"expected_version": 0, "rows": []})
    assert stale["http_status"] == 409
    invalid = owner.call("POST", path + "/query", {"definition": {"sql": "SELECT 1"}})
    assert invalid["http_status"] == 422
    member, user, _ = identity()
    invitation = success(owner, "POST", prefix + "/memberships", {"platform_user_id": user["id"], "role": "member"})["membership"]
    success(member, "POST", prefix + f"/memberships/{invitation['id']}/accept", {"expected_version": invitation["version"]})
    assert member.call("POST", report_path + "/run", {})["http_status"] == 404
    assert member.call("POST", dashboard_path + "/render", {})["http_status"] == 404
    assert member.call("POST", base + "/datasets", {"name": "Forbidden", "visibility": "private", "schema": [{"name": "x", "type": "integer"}]})["http_status"] == 403
    success(owner, "PUT", path, {"name": "Shared", "visibility": "organization", "status": "active", "expected_version": dataset["version"]})
    assert success(member, "POST", report_path + "/run", {})["data"] == output["data"]
