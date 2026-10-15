"""Real core→signed isolated ERP service→correlated balanced ledger results."""

import datetime
import subprocess
import uuid

from test_platform_identity import identity, success


def workspace():
    owner, _, _ = identity()
    organization = success(owner, "POST", "organizations", {
        "code": "erp-" + uuid.uuid4().hex, "name": "ERP integration",
    })["organization"]
    organization_id = organization["id"]
    command = ["docker", "exec", "commerce-tests-db-1", "psql", "-U", "commerce", "-d", "commerce_test",
               "-v", "ON_ERROR_STOP=1", "-Atc"]
    assert subprocess.run(command + ["SELECT current_database()"], check=True, capture_output=True, text=True).stdout.strip() == "commerce_test"
    evidence = "synthetic-erp-wire-" + uuid.uuid4().hex
    subprocess.run(command + [
        ("INSERT INTO application_entitlement_grants (organization_id,application_key,source,evidence_ref,starts_at,created_at,updated_at) "
        f"VALUES ({organization_id},'erp','operator','{evidence}',now()-interval '1 second',now(),now())")
    ], check=True, capture_output=True, text=True)
    prefix = f"organizations/{organization_id}"
    catalog = success(owner, "GET", prefix + "/application-catalog?application_key=erp&per_page=1")
    assert catalog["data"][0]["entitled"] is True and catalog["data"][0]["available"] is True
    success(owner, "POST", prefix + "/applications/erp/install", {"expected_version": 0})
    return owner, prefix


def test_erp_eleven_paths_balance_post_reversal_and_immutable_original():
    owner, prefix = workspace()
    erp = prefix + "/erp"
    accounts = erp + "/accounts"
    cash = success(owner, "POST", accounts, {"code": "cash", "name": "Cash", "type": "asset"})["account"]
    revenue = success(owner, "POST", accounts, {"code": "revenue", "name": "Revenue", "type": "revenue"})["account"]
    listed = success(owner, "GET", accounts + "?type=asset&per_page=1")
    assert listed["data"] == [cash] and listed["meta"]["options"]["type"]["asset"] == "Asset"
    assert success(owner, "GET", accounts + f"/{cash['id']}")["account"] == cash
    renamed = success(owner, "PATCH", accounts + f"/{cash['id']}", {
        "name": "Cash on hand", "expected_version": cash["version"],
    })["account"]
    assert renamed["version"] == 1 and renamed["code"] == "cash"
    today = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    journal_input = {"effective_date": today, "description": "Sale", "currency": "USD", "lines": [
        {"account_id": cash["id"], "debit_minor": 1250, "credit_minor": 0},
        {"account_id": revenue["id"], "debit_minor": 0, "credit_minor": 1250},
    ]}
    journals = erp + "/journals"
    draft = success(owner, "POST", journals, journal_input)["journal"]
    assert draft["status"] == "draft" and draft["total_minor"] == 1250 and draft["version"] == 0
    assert len(draft["lines"]) == 2 and "organization_id" not in draft
    assert success(owner, "GET", journals + "?status=draft&per_page=1")["data"][0]["id"] == draft["id"]
    assert success(owner, "GET", journals + f"/{draft['id']}")["journal"] == draft
    assert success(owner, "GET", erp + f"/ledger?account_id={cash['id']}&per_page=1")["data"] == []
    edited = success(owner, "PATCH", journals + f"/{draft['id']}", {
        **journal_input, "description": "Revised sale", "expected_version": 0,
    })["journal"]
    assert edited["version"] == 1 and edited["description"] == "Revised sale"
    assert owner.call("POST", journals + f"/{draft['id']}/post", {"expected_version": 0})["http_status"] == 409
    posted = success(owner, "POST", journals + f"/{draft['id']}/post", {"expected_version": 1})["journal"]
    assert posted["status"] == "posted" and posted["version"] == 2 and posted["posted_at"]
    ledger = success(owner, "GET", erp + f"/ledger?account_id={cash['id']}&per_page=1")
    assert ledger["meta"]["total"] == 1 and ledger["data"][0]["debit_minor"] == 1250
    assert owner.call("PATCH", journals + f"/{draft['id']}", {
        **journal_input, "description": "Tamper", "expected_version": 2,
    })["http_status"] == 409
    reversal = success(owner, "POST", journals + f"/{draft['id']}/reverse", {
        "expected_version": 2, "effective_date": today,
    })["journal"]
    assert reversal["status"] == "posted" and reversal["reverses_journal_id"] == draft["id"]
    assert reversal["lines"][0]["credit_minor"] == 1250
    assert success(owner, "GET", journals + f"/{draft['id']}")["journal"] == posted
    assert success(owner, "GET", erp + f"/ledger?account_id={cash['id']}")["meta"]["total"] == 2
    assert owner.call("POST", journals + f"/{draft['id']}/reverse", {
        "expected_version": 2, "effective_date": today,
    })["http_status"] == 409
    bad = owner.call("POST", journals, {**journal_input, "lines": [
        journal_input["lines"][0], {**journal_input["lines"][1], "credit_minor": 1249},
    ]})
    assert bad["http_status"] == 422 and "lines" in bad["result"]["validation_error"]
    foreign, _, _ = identity()
    assert foreign.call("GET", erp + "/accounts")["http_status"] in {403, 404}
