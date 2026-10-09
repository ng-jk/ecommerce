"""Mini App package lifecycle and capability boundary over real HTTP/workers."""

import json
import subprocess
import uuid
import zipfile
from pathlib import Path
from urllib.parse import urlsplit

import httpx
import pytest

from tests.api.conftest import reset_plugin_data
from tests.api.test_assistant_matrix import Assistant
from tests.api.test_multi_payments import _admin
from tests.api.test_plugins import account, result
from tests.api.test_worker_api import Client

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(autouse=True)
def isolated_miniapps():
    reset_plugin_data()
    command = [
        "docker",
        "exec",
        "commerce-tests-db-1",
        "psql",
        "-U",
        "commerce",
        "-d",
        "commerce_test",
        "-v",
        "ON_ERROR_STOP=1",
        "-Atc",
    ]
    database = subprocess.run(
        command + ["SELECT current_database()"],
        check=True,
        capture_output=True,
        text=True,
    )
    assert database.stdout.strip() == "commerce_test"
    subprocess.run(
        command
        + [
            "TRUNCATE mini_app_launches, mini_app_installations, mini_app_versions, mini_app_packages"
        ],
        check=True,
        capture_output=True,
        text=True,
    )


def operator(*arguments, approver=None, succeeds=True):
    command = ["docker", "exec", "--user", "www-data"]
    if approver:
        command += ["-e", f"MINIAPP_APPROVER_USER_IDS={approver}"]
    command += ["commerce-tests-backend-1", "php", "artisan", *arguments]
    completed = subprocess.run(
        command, capture_output=True, text=True, timeout=40, check=False
    )
    assert (completed.returncode == 0) == succeeds, completed.stdout + completed.stderr


def package(tmp_path, slug, visibility="public"):
    archive = tmp_path / f"{slug}.zip"
    manifest = {
        "id": slug,
        "name": "API Mini App fixture",
        "version": "1.0.0",
        "entry": "index.html",
        "capabilities": [
            "catalog",
            "product",
            "cart.read",
            "orders",
            "plugin.loyalty.balance",
        ],
    }
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as output:
        output.writestr("manifest.json", json.dumps(manifest))
        output.writestr(
            "index.html",
            "<!doctype html><html><body><h1>Mini App</h1>"
            '<script type="module" src="app.js"></script></body></html>',
        )
        output.writestr("app.js", 'document.body.dataset.ready = "yes";')
    remote = f"/tmp/{slug}.zip"
    subprocess.run(
        ["docker", "cp", str(archive), f"commerce-tests-backend-1:{remote}"],
        capture_output=True,
        check=True,
        timeout=30,
    )
    flags = [f"--visibility={visibility}"]
    if visibility == "private":
        flags.append("--shop=fashion")
    operator("miniapps:import", remote, *flags)


def test_miniapp_approval_sdk_isolation_and_live_revocation(tmp_path):
    admin_token = _admin("fashion")
    admin = Client("fashion", admin_token)
    other = Client("electronics", _admin("electronics"))
    user, _, _ = account("fashion")
    foreign_user, _, _ = account("electronics")
    approver = admin.http.get(
        "http://localhost:8088/api/v1/shops/fashion/auth/me"
    ).json()["user"]["id"]
    slug = "mini-" + uuid.uuid4().hex[:16]
    package(tmp_path, slug)
    before = result(admin, "GET", "admin/miniapps")
    assert slug not in {item["slug"] for item in before["catalog"]["data"]}
    operator(
        "miniapps:approve", slug, "1.0.0", f"--approver-id={approver}", succeeds=False
    )
    operator(
        "miniapps:approve",
        slug,
        "1.0.0",
        f"--approver-id={approver}",
        approver=approver,
    )
    ai = Assistant("fashion", admin_token)
    catalog = ai.invoke("adminMiniapps")["catalog"]["data"]
    definition = next(item for item in catalog if item["slug"] == slug)
    args = {
        "package_id": definition["package_id"],
        "version": "1.0.0",
        "grants": [
            "catalog",
            "product",
            "cart.read",
            "orders",
            "plugin.loyalty.balance",
        ],
    }
    installed = ai.invoke("installMiniapp", args)["miniapp"]
    other_installation = result(other, "POST", "admin/miniapps", args)["miniapp"]
    assert other_installation["id"] != installed["id"]
    assert not other_installation["enabled"]
    installation = installed["id"]
    assert not installed["enabled"]
    result(user, "POST", f"miniapps/{installation}/launch", {}, status=404)
    enabled = ai.invoke("updateMiniapp", {"id": installation, "enabled": True})[
        "miniapp"
    ]
    assert enabled["config_version"] > installed["config_version"]
    assert any(
        item["id"] == installation
        for item in result(user, "GET", "miniapps")["miniapps"]["data"]
    )
    assert any(
        item["id"] == installation for item in ai.invoke("miniapps")["miniapps"]["data"]
    )
    launch = ai.invoke("launchMiniapp", {"id": installation})["launch"]
    invoked = ai.invoke(
        "invokeMiniapp",
        {
            "id": installation,
            "launch_id": launch["id"],
            "capability": "catalog",
            "input": {},
        },
    )
    products = invoked["response"]["products"]["data"]
    assert products
    customer_launch = result(user, "POST", f"miniapps/{installation}/launch", {})[
        "launch"
    ]
    path = f"miniapps/{installation}/invoke"
    payload = {"launch_id": customer_launch["id"], "capability": "catalog", "input": {}}
    assert result(user, "POST", path, payload)["response"]["products"]["data"]
    result(user, "POST", path, {**payload, "launch_id": launch["id"]}, status=404)
    result(foreign_user, "POST", path, payload, status=404)
    result(user, "POST", path, {**payload, "capability": "admin.products"}, status=403)
    result(user, "POST", path, {**payload, "input": {"shop_id": 2}}, status=422)
    result(
        user,
        "POST",
        path,
        {**payload, "capability": "product", "input": {"id": products[0]["id"]}},
    )
    result(user, "POST", path, {**payload, "capability": "cart.read"})
    orders = result(user, "POST", path, {**payload, "capability": "orders"})
    assert "payment_url" not in json.dumps(orders)
    loyalty_payload = {**payload, "capability": "plugin.loyalty.balance"}
    result(user, "POST", path, loyalty_payload, status=403)
    plugin = result(admin, "POST", "admin/plugins", {"plugin_id": "loyalty"})["plugin"]
    result(
        admin,
        "PATCH",
        f"admin/plugins/{plugin['id']}",
        {
            "expected_version": plugin["version"],
            "enabled": True,
            "customer_enabled": True,
        },
    )
    assert (
        result(user, "POST", path, loyalty_payload)["response"]["balance"]["points"]
        == 0
    )
    result(user, "POST", "admin/miniapps", args, status=403)
    result(
        other,
        "PATCH",
        f"admin/miniapps/{installation}",
        {"expected_version": enabled["config_version"], "enabled": False},
        status=404,
    )
    asset_path = urlsplit(launch["entry_url"]).path
    with httpx.Client(trust_env=False) as wire:
        asset = wire.get(
            "http://localhost:8088" + asset_path,
            headers={"Host": "miniapps.localhost:8088"},
        )
        assert asset.status_code == 200
        assert "sandbox allow-scripts" in asset.headers["content-security-policy"]
        assert "connect-src 'none'" in asset.headers["content-security-policy"]
        assert "set-cookie" not in asset.headers
        assert wire.get("http://localhost:8088" + asset_path).status_code != 200
        assert (
            wire.get(
                "http://localhost:8088/api/v1/shops/fashion/products",
                headers={"Host": "miniapps.localhost:8088"},
            ).status_code
            == 404
        )
    changed = result(
        admin,
        "PATCH",
        f"admin/miniapps/{installation}",
        {"expected_version": enabled["config_version"], "grants": ["catalog"]},
    )["miniapp"]
    result(user, "POST", path, payload, status=403)
    result(
        admin,
        "PATCH",
        f"admin/miniapps/{installation}",
        {"expected_version": enabled["config_version"], "enabled": False},
        status=409,
    )
    fresh = result(user, "POST", f"miniapps/{installation}/launch", {})["launch"]
    result(
        user,
        "POST",
        path,
        {**payload, "launch_id": fresh["id"], "capability": "orders"},
        status=403,
    )
    operator(
        "miniapps:revoke", slug, "1.0.0", f"--approver-id={approver}", approver=approver
    )
    result(user, "POST", path, {**payload, "launch_id": fresh["id"]}, status=403)
    operator(
        "miniapps:approve",
        slug,
        "1.0.0",
        f"--approver-id={approver}",
        approver=approver,
    )
    result(user, "POST", path, {**payload, "launch_id": fresh["id"]}, status=403)
    assert changed["enabled"]


def test_private_miniapp_not_installable_by_other_merchant(tmp_path):
    admin = Client("fashion", _admin("fashion"))
    other = Client("electronics", _admin("electronics"))
    approver = admin.http.get(
        "http://localhost:8088/api/v1/shops/fashion/auth/me"
    ).json()["user"]["id"]
    slug = "private-" + uuid.uuid4().hex[:16]
    package(tmp_path, slug, "private")
    operator(
        "miniapps:approve",
        slug,
        "1.0.0",
        f"--approver-id={approver}",
        approver=approver,
    )
    definition = next(
        item
        for item in result(admin, "GET", "admin/miniapps")["catalog"]["data"]
        if item["slug"] == slug
    )
    result(
        other,
        "POST",
        "admin/miniapps",
        {"package_id": definition["package_id"], "version": "1.0.0", "grants": []},
        status=404,
    )
    assert slug not in {
        item["slug"]
        for item in result(other, "GET", "admin/miniapps")["catalog"]["data"]
    }
