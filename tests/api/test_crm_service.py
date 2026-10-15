"""Real core→signed inbox→isolated CRM worker→core result API flows."""

import subprocess
import uuid

from test_platform_identity import identity, success


def grant_test_crm(organization_id):
    """Trusted fixture setup is restricted to the explicitly named isolated database."""
    assert type(organization_id) is int and organization_id > 0
    command = ["docker", "exec", "commerce-tests-db-1", "psql", "-U", "commerce", "-d", "commerce_test", "-v", "ON_ERROR_STOP=1", "-Atc"]
    assert subprocess.run(command + ["SELECT current_database()"], check=True, capture_output=True, text=True).stdout.strip() == "commerce_test"
    evidence = "synthetic-crm-wire-" + uuid.uuid4().hex
    subprocess.run(command + [
        "INSERT INTO application_entitlement_grants (organization_id,application_key,source,evidence_ref,starts_at,created_at,updated_at) "
        f"VALUES ({organization_id},'crm','operator','{evidence}',now()-interval '1 second',now(),now())"
    ], check=True, capture_output=True, text=True)


def workspace():
    owner, _, _ = identity()
    organization = success(owner, "POST", "organizations", {"code": "crm-" + uuid.uuid4().hex, "name": "CRM integration"})["organization"]
    grant_test_crm(organization["id"])
    prefix = f"organizations/{organization['id']}"
    catalog = success(owner, "GET", prefix + "/application-catalog?application_key=crm&per_page=1")
    assert catalog["data"][0]["entitled"] is True
    assert catalog["data"][0]["available"] is True
    installed = success(owner, "POST", prefix + "/applications/crm/install", {"expected_version": 0})
    assert installed["application"]["state"] == "installed"
    return owner, prefix, installed


def test_crm_all_initial_business_api_paths_and_installation_controls():
    owner, prefix, installed = workspace()
    crm = prefix + "/crm"
    company = success(owner, "POST", crm + "/companies", {"code": "acme", "name": "Acme"})["company"]
    assert success(owner, "GET", crm + "/companies?code=acme&per_page=1")["data"] == [company]
    assert success(owner, "GET", crm + f"/companies/{company['id']}")["company"] == company
    changed = success(owner, "PATCH", crm + f"/companies/{company['id']}", {"name": "Acme Updated", "expected_version": company["version"]})["company"]
    assert changed["version"] == company["version"] + 1
    contact = success(owner, "POST", crm + "/contacts", {"name": "Buyer", "email": "buyer@example.test", "company_id": company["id"]})["contact"]
    assert success(owner, "GET", crm + f"/contacts?company_id={company['id']}&per_page=1")["data"] == [contact]
    assert success(owner, "GET", crm + f"/contacts/{contact['id']}")["contact"] == contact
    updated_contact = success(owner, "PATCH", crm + f"/contacts/{contact['id']}", {"name": "Buyer Updated", "email": contact["email"], "company_id": company["id"], "expected_version": contact["version"]})["contact"]
    assert updated_contact["name"] == "Buyer Updated"
    lead = success(owner, "POST", crm + "/leads", {"name": "Prospect", "email": "lead@example.test", "company_id": company["id"]})["lead"]
    listing = success(owner, "GET", crm + f"/leads?company_id={company['id']}&status=new&per_page=1")
    assert listing["data"] == [lead] and listing["meta"]["options"]["status"]["new"]
    assert success(owner, "GET", crm + f"/leads/{lead['id']}")["lead"] == lead
    contacted = success(owner, "PATCH", crm + f"/leads/{lead['id']}", {"name": "Prospect Updated", "email": lead["email"], "company_id": company["id"], "status": "contacted", "expected_version": lead["version"]})["lead"]
    updated_lead = success(owner, "PATCH", crm + f"/leads/{lead['id']}", {"name": "Prospect Updated", "email": lead["email"], "company_id": company["id"], "status": "qualified", "expected_version": contacted["version"]})["lead"]
    converted = success(owner, "POST", crm + f"/leads/{lead['id']}/convert", {"expected_version": updated_lead["version"]})
    assert converted["lead"]["status"] == "converted"
    assert converted["lead"]["contact_id"] == converted["contact"]["id"]
    invalid = owner.call("POST", crm + "/companies", {"code": "acme", "name": "Duplicate"})
    assert invalid["http_status"] == 422 and "code" in invalid["result"]["validation_error"]
    stale = owner.call("PATCH", crm + f"/companies/{company['id']}", {"name": "Stale", "expected_version": company["version"]})
    assert stale["http_status"] == 409
    disabled = success(owner, "POST", prefix + "/applications/crm/disable", {"expected_version": installed["application"]["version"]})
    denied = owner.call("GET", crm + "/companies")
    assert denied["http_status"] == 403
    success(owner, "POST", prefix + "/applications/crm/reenable", {"expected_version": disabled["application"]["version"]})
    assert success(owner, "GET", crm + "/companies")["meta"]["total"] == 1


def test_crm_ai_uses_same_isolated_service_and_confirmation():
    owner, prefix, _ = workspace()
    organization_id = int(prefix.split("/")[1])
    discovery = success(owner, "POST", "assistant", {"discover": True})
    tools = {item["name"]: item for item in discovery["available_actions"]}
    create = next(name for name, tool in tools.items() if tool["path"].endswith("/crm/companies") and tool["method"] == "POST")
    read = next(name for name, tool in tools.items() if tool["path"].endswith("/crm/companies") and tool["method"] == "GET")
    receipt = "a" * 64
    draft = owner.finish(*owner.submit("POST", "assistant", {"action": create, "data": {"organization_id": organization_id, "code": "ai-company", "name": "Assistant company"}}, receipt=receipt))["result"]
    assert draft["status"] == "needs_confirmation"
    result = owner.finish(*owner.submit("POST", "assistant", {"conversation_id": draft["conversation_id"], "conversation_version": draft["conversation_version"], "confirm": True}, receipt=receipt))
    assert result["status"] == "succeeded", result
    assert result["result"]["api_result"]["company"]["name"] == "Assistant company"
    queried = success(owner, "POST", "assistant", {"action": read, "data": {"organization_id": organization_id, "per_page": 1}})
    assert queried["api_result"]["data"][0]["code"] == "ai-company"


def test_crm_foreign_organization_and_direct_unauthorized_api_are_denied():
    owner, prefix, _ = workspace()
    foreign, _, _ = identity()
    denied = foreign.call("GET", prefix + "/crm/companies")
    assert denied["http_status"] in {403, 404}
    invalid = owner.call("GET", prefix + "/crm/companies?page=0")
    assert invalid["http_status"] == 422 and "page" in invalid["result"]["validation_error"]
