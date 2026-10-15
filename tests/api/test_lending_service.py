"""Real platform → signed Lending inbox → isolated worker → durable receipt flows."""

import subprocess
import uuid
from datetime import datetime, timedelta, timezone

from test_platform_identity import identity, success


def grant_test_lending(organization_id):
    assert type(organization_id) is int and organization_id > 0
    command = ["docker", "exec", "commerce-tests-db-1", "psql", "-U", "commerce", "-d", "commerce_test", "-v", "ON_ERROR_STOP=1", "-Atc"]
    assert subprocess.run(command + ["SELECT current_database()"], check=True, capture_output=True, text=True).stdout.strip() == "commerce_test"
    evidence = "synthetic-lending-wire-" + uuid.uuid4().hex
    subprocess.run(command + [
        ("INSERT INTO application_entitlement_grants (organization_id,application_key,source,evidence_ref,starts_at,created_at,updated_at) "
        f"VALUES ({organization_id},'lending','operator','{evidence}',now()-interval '1 second',now(),now())")
    ], check=True, capture_output=True, text=True)


def lending_workspace():
    owner, _, _ = identity()
    organization = success(owner, "POST", "organizations", {
        "code": "lending-" + uuid.uuid4().hex, "name": "Lending integration"
    })["organization"]
    grant_test_lending(organization["id"])
    prefix = f"organizations/{organization['id']}"
    catalog = success(owner, "GET", prefix + "/application-catalog?application_key=lending&per_page=1")
    assert catalog["data"][0]["entitled"] is True
    assert catalog["data"][0]["available"] is True
    installed = success(owner, "POST", prefix + "/applications/lending/install", {"expected_version": 0})["application"]
    return owner, prefix, prefix + "/lending", installed




def test_lending_all_fourteen_commands_freeze_separation_and_exact_schedule():
    owner, prefix, base, _ = lending_workspace()
    terms = {"name": "Configured product", "jurisdiction_label": "Operator test scope", "terms_text": "Fixed whole-term charge, not APR. No payment or balance recorded.",
             "currency": "MYR", "minor_unit_digits": 2, "principal_min_minor": 1, "principal_max_minor": 1000000,
             "term_rate_numerator": 1, "term_rate_denominator": 10, "installment_count": 3, "interval_days": 30}
    product = success(owner, "POST", base + "/products", {"code": "explicit-terms", **terms})["product"]
    product_path = base + f"/products/{product['id']}"
    assert product["status"] == "draft"
    assert success(owner, "GET", base + "/products?page=1&per_page=1&status=draft")["data"][0]["id"] == product["id"]
    assert success(owner, "GET", product_path)["product"]["jurisdiction_label"] == terms["jurisdiction_label"]
    product = success(owner, "PATCH", product_path, {**terms, "status": "active", "expected_version": product["version"]})["product"]
    due = (datetime.now(timezone.utc) + timedelta(days=30)).date().isoformat()
    application = success(owner, "POST", base + "/applications", {"product_id": product["id"], "principal_minor": 101, "first_due_date": due, "purpose": "Test application"})["application"]
    application_path = base + f"/applications/{application['id']}"
    application = success(owner, "PATCH", application_path, {"expected_version": application["version"], "principal_minor": 103, "first_due_date": due, "purpose": "Updated evidence"})["application"]
    assert success(owner, "GET", base + "/applications?page=1&per_page=1&status=draft")["data"][0]["id"] == application["id"]
    assert success(owner, "GET", application_path)["application"]["purpose"] == "Updated evidence"
    submitted = success(owner, "POST", application_path + "/submit", {"expected_version": application["version"]})["application"]
    assert submitted["terms_snapshot"]["product_version"] == product["version"]
    review_path = base + f"/reviews/{application['id']}"
    decision = {"expected_version": submitted["version"], "decision": "approved", "decision_note": "Separate decision maker checked the frozen terms."}
    assert owner.call("POST", review_path + "/decide", decision)["http_status"] == 403
    reviewer, user, _ = identity()
    membership = success(owner, "POST", prefix + "/memberships", {"platform_user_id": user["id"], "role": "admin"})["membership"]
    success(reviewer, "POST", prefix + f"/memberships/{membership['id']}/accept", {"expected_version": membership["version"]})
    assert success(reviewer, "GET", base + "/reviews?page=1&per_page=1&status=submitted")["data"][0]["id"] == application["id"]
    assert success(reviewer, "GET", review_path)["application"]["terms_snapshot"] == submitted["terms_snapshot"]
    assert reviewer.call("GET", application_path)["http_status"] == 404
    product = success(owner, "PATCH", product_path, {**terms, "term_rate_numerator": 9, "status": "active", "expected_version": product["version"]})["product"]
    approved = success(reviewer, "POST", review_path + "/decide", decision)["application"]
    assert approved["terms_snapshot"] == submitted["terms_snapshot"]
    assert reviewer.call("POST", review_path + "/decide", decision)["http_status"] == 409
    schedule = success(owner, "GET", application_path + "/schedule")
    assert schedule["principal_minor"] == 103 and schedule["charge_minor"] == 11 and schedule["total_minor"] == 114
    assert sum(row["total_minor"] for row in schedule["installments"]) == 114
    assert [row["principal_minor"] for row in schedule["installments"]] == [35, 34, 34]
    draft = success(owner, "POST", base + "/applications", {"product_id": product["id"], "principal_minor": 100, "first_due_date": due, "purpose": "Withdraw me"})["application"]
    withdrawn = success(owner, "POST", base + f"/applications/{draft['id']}/withdraw", {"expected_version": draft["version"]})["application"]
    assert withdrawn["status"] == "withdrawn"
    assert owner.call("POST", application_path + "/withdraw", {"expected_version": approved["version"]})["http_status"] == 409
    success(owner, "PATCH", product_path, {**terms, "status": "disabled", "expected_version": product["version"]})
    assert success(owner, "GET", application_path + "/schedule") == schedule
