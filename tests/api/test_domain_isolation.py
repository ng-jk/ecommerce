"""Verify actual runtime database and network isolation without printing credentials."""

import json
import subprocess

import pytest


@pytest.mark.parametrize(
    "service", ["crm", "helpdesk", "learning", "builder", "insights", "erp", "hr", "lending"]
)
def test_service_credentials_and_network_cannot_reach_core(service):
    program = r"""
    $user = getenv("DB_USERNAME"); $password = getenv("DB_PASSWORD");
    $database = getenv("DB_DATABASE"); $host = getenv("DB_HOST");
    $own = new PDO("pgsql:host=$host;dbname=$database;connect_timeout=3", $user, $password);
    $role = $own->query("SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user")->fetch(PDO::FETCH_ASSOC);
    $tables = $own->query("SELECT tablename FROM pg_tables WHERE schemaname='public'")->fetchAll(PDO::FETCH_COLUMN);
    $denied = [];
    foreach ([[$host, "postgres"], ["db", "commerce_test"], ["db", "commerce"]] as [$target, $name]) {
        try { new PDO("pgsql:host=$target;dbname=$name;connect_timeout=3", $user, $password); $denied[] = false; }
        catch (PDOException $error) { $denied[] = true; }
    }
    echo json_encode(["database"=>$database,"role"=>$role,"tables"=>$tables,"denied"=>$denied]);
    """
    result = subprocess.run(
        ["docker", "exec", f"commerce-tests-{service}-1", "php", "-r", program],
        capture_output=True,
        text=True,
        check=True,
        timeout=30,
    )
    evidence = json.loads(result.stdout)
    assert evidence["database"] == f"{service}_test"
    assert evidence["role"] == {
        "rolsuper": False,
        "rolcreatedb": False,
        "rolcreaterole": False,
    }
    assert evidence["denied"] == [True, True, True]
    assert {"service_inboxes", "service_deliveries"}.issubset(evidence["tables"])
    assert not {
        "users",
        "platform_users",
        "organizations",
        "orders",
        "operations",
    }.intersection(evidence["tables"])
