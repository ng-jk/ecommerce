"""Server deployment isolation/interface checks; no Docker or external access."""

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]


def server_config():
    return yaml.safe_load((ROOT / "compose.server.yaml").read_text(encoding="utf-8"))


def environment_example(name):
    lines = (
        (ROOT / "docker" / f"server.{name}.env.example")
        .read_text(encoding="utf-8")
        .splitlines()
    )
    return dict(
        line.split("=", 1) for line in lines if line and not line.startswith("#")
    )


def test_only_gateway_publishes_a_loopback_port_and_private_services_stay_private():
    config = server_config()
    services = config["services"]
    assert set(services) == {
        "backend",
        "worker",
        "fashion",
        "electronics",
        "admin",
        "gateway",
        "functiongemma",
    }
    for name, service in services.items():
        if name != "gateway":
            assert not service.get("ports"), name
            assert service.get("network_mode") != "host", name
    assert len(services["gateway"]["ports"]) == 1
    assert services["gateway"]["ports"][0].startswith("127.0.0.1:")
    assert services["gateway"]["ports"][0].endswith(":8080")
    assert config["networks"]["supabase"]["external"] is True
    assert services["functiongemma"]["profiles"] == ["assistant"]
    assert services["functiongemma"]["networks"] == ["application"]


def test_releases_tag_every_built_image_including_optional_inference_for_rollback():
    services = server_config()["services"]
    for name, service in services.items():
        if "build" in service:
            assert "${RELEASE_ID:-local}" in service["image"], name
            assert "${APP_IMAGE_PREFIX:-shop3i}" in service["image"], name
    assert services["worker"]["image"] == services["backend"]["image"]
    assert services["worker"]["command"] == ["php", "artisan", "commerce:work"]
    for name in ("backend", "worker"):
        assert services[name]["build"]["target"] == "production"
        env = services[name]["environment"]
        assert env["APP_ENV"] == "production"
        assert env["APP_DEBUG"] == "false"
        assert env["SESSION_SECURE_COOKIE"] == "true"
        assert services[name]["networks"] == ["application", "supabase"]
    for name in ("fashion", "electronics", "admin"):
        assert services[name]["build"]["args"]["APP"] == name
        assert services[name]["networks"] == ["application"]


def test_environment_examples_isolate_principals_data_cookies_images_and_origins():
    production = environment_example("production")
    testing = environment_example("testing")
    for key in (
        "DB_DATABASE",
        "DB_USERNAME",
        "SESSION_COOKIE",
        "APP_IMAGE_PREFIX",
        "GATEWAY_PORT",
    ):
        assert production[key] != testing[key], key
    production_hosts = {
        production[key]
        for key in ("FASHION_HOST", "ELECTRONICS_HOST", "ADMIN_HOST", "API_HOST")
    }
    testing_hosts = {
        testing[key]
        for key in ("FASHION_HOST", "ELECTRONICS_HOST", "ADMIN_HOST", "API_HOST")
    }
    assert production_hosts.isdisjoint(testing_hosts)
    assert all(host.count(".") == 2 for host in testing_hosts)
    assert production["GATEWAY_PORT"] == "8080"
    assert testing["GATEWAY_PORT"] == "8081"
    for env in (production, testing):
        assert env["SUPABASE_NETWORK"] == "shop3i-supabase_default"
        assert env["DB_HOST"] == "db"
        for key in (
            "APP_KEY",
            "DB_PASSWORD",
            "STRIPE_SECRET_KEY",
            "STRIPE_WEBHOOK_SECRET",
            "HF_TOKEN",
        ):
            assert env[key] == "", key


def test_tunnel_proxy_rejects_unknown_hosts_and_sanitizes_trusted_scheme_headers():
    caddy = (ROOT / "docker" / "Caddyfile.tunnel").read_text(encoding="utf-8")
    for host in ("FASHION_HOST", "ELECTRONICS_HOST", "ADMIN_HOST", "API_HOST"):
        assert "http://{$" + host + "}:8080" in caddy
    for header in ("X-Forwarded-Host", "X-Forwarded-Prefix", "Forwarded"):
        assert f"request_header -{header}" in caddy
    assert "env HTTPS on" in caddy
    assert "env SERVER_PORT 443" in caddy
    assert "header_up X-Forwarded-Proto https" in caddy
    assert "header_up X-Forwarded-Port 443" in caddy
    assert 'respond "Unknown host" 404' in caddy
    assert "admin off" in caddy
