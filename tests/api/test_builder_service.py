"""Real core→signed Builder service→correlated result page workflow."""

import subprocess
import uuid

from test_platform_identity import identity, success


def workspace():
    owner, _, _ = identity()
    organization = success(owner, "POST", "organizations", {
        "code": "builder-" + uuid.uuid4().hex, "name": "Builder integration",
    })["organization"]
    organization_id = organization["id"]
    command = ["docker", "exec", "commerce-tests-db-1", "psql", "-U", "commerce", "-d", "commerce_test",
               "-v", "ON_ERROR_STOP=1", "-Atc"]
    assert subprocess.run(command + ["SELECT current_database()"], check=True, capture_output=True, text=True).stdout.strip() == "commerce_test"
    evidence = "synthetic-builder-wire-" + uuid.uuid4().hex
    subprocess.run(command + [
        ("INSERT INTO application_entitlement_grants (organization_id,application_key,source,evidence_ref,starts_at,created_at,updated_at) "
        f"VALUES ({organization_id},'builder','operator','{evidence}',now()-interval '1 second',now(),now())")
    ], check=True, capture_output=True, text=True)
    prefix = f"organizations/{organization_id}"
    catalog = success(owner, "GET", prefix + "/application-catalog?application_key=builder&per_page=1")
    assert catalog["data"][0]["entitled"] is True
    assert catalog["data"][0]["available"] is True
    success(owner, "POST", prefix + "/applications/builder/install", {"expected_version": 0})
    return owner, prefix


def test_builder_all_six_paths_publish_snapshot_and_reject_executable_blocks():
    owner, prefix = workspace()
    builder = prefix + "/builder/pages"
    draft = success(owner, "POST", builder, {"slug": "home", "title": "Home", "blocks": [
        {"type": "heading", "text": "Welcome", "level": 1},
        {"type": "button", "label": "Shop", "url": "https://example.org/shop"},
    ]})["page"]
    assert draft["status"] == "draft" and draft["version"] == 0
    assert "organization_id" not in draft and "created_by_platform_user_id" not in draft
    listed = success(owner, "GET", builder + "?status=draft&per_page=1")
    assert listed["data"] == [draft] and listed["meta"]["options"]["block_type"]["heading"] == "Heading"
    assert success(owner, "GET", builder + f"/{draft['id']}")["page"] == draft
    assert owner.call("GET", builder + f"/{draft['id']}/render")["http_status"] == 404
    first = success(owner, "POST", builder + f"/{draft['id']}/publish", {"expected_version": 0})["page"]
    assert first["published_version"] == 1 and first["status"] == "published"
    rendered = success(owner, "GET", builder + f"/{draft['id']}/render")["render"]
    assert rendered["title"] == "Home" and rendered["blocks"] == draft["blocks"]
    edited = success(owner, "PATCH", builder + f"/{draft['id']}", {
        "title": "Home next", "blocks": [{"type": "paragraph", "text": "Next draft"}], "expected_version": 1,
    })["page"]
    assert edited["status"] == "draft" and edited["version"] == 2
    assert success(owner, "GET", builder + f"/{draft['id']}/render")["render"] == rendered
    assert owner.call("POST", builder + f"/{draft['id']}/publish", {"expected_version": 1})["http_status"] == 409
    republished = success(owner, "POST", builder + f"/{draft['id']}/publish", {"expected_version": 2})["page"]
    assert republished["published_version"] == 3
    assert success(owner, "GET", builder + f"/{draft['id']}/render")["render"]["title"] == "Home next"
    unsafe = owner.call("POST", builder, {"slug": "unsafe", "title": "Unsafe", "blocks": [
        {"type": "paragraph", "text": "<script>alert(1)</script>"},
    ]})
    assert unsafe["http_status"] == 422 and "blocks.0.text" in unsafe["result"]["validation_error"]
    duplicate = owner.call("POST", builder, {"slug": "home", "title": "Duplicate", "blocks": []})
    assert duplicate["http_status"] == 422 and "slug" in duplicate["result"]["validation_error"]
    foreign, _, _ = identity()
    assert foreign.call("GET", builder)["http_status"] in {403, 404}
