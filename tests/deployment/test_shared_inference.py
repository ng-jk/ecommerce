"""Shared inference topology contract; does not require Docker or model weights."""

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
SHARED = ROOT / "compose.inference.shared.yaml"
PROXY = ROOT / "docker/shared-inference/Caddyfile"


def config():
    return yaml.safe_load(SHARED.read_text(encoding="utf-8"))


def test_one_private_model_uses_only_the_prepopulated_read_only_cache():
    compose = config()
    assert set(compose["services"]) == {
        "shared-model",
        "production-proxy",
        "testing-proxy",
    }
    model = compose["services"]["shared-model"]
    assert model["image"].startswith("${SHARED_INFERENCE_IMAGE:?")
    assert model["pull_policy"] == "never"
    assert "build" not in model
    assert model["networks"] == ["inference"]
    assert compose["networks"]["inference"]["internal"] is True
    assert model["volumes"] == [
        {
            "type": "volume",
            "source": "model-cache",
            "target": "/models",
            "read_only": True,
        }
    ]
    assert compose["volumes"]["model-cache"] == {
        "external": True,
        "name": "${SHARED_INFERENCE_CACHE_VOLUME:?Set the pre-populated model cache volume}",
    }
    env = model["environment"]
    assert env["FUNCTIONGEMMA_MODEL"].startswith("${SHARED_INFERENCE_MODEL_PATH:?")
    assert env["FUNCTIONGEMMA_DTYPE"] == "${SHARED_INFERENCE_DTYPE:-float32}"
    assert env["HF_HOME"] == "/models"
    assert env["HF_HUB_OFFLINE"] == env["TRANSFORMERS_OFFLINE"] == "1"
    assert not any("TOKEN" in key or "DB_" in key for key in env)
    assert model["healthcheck"]["test"][:3] == ["CMD", "python", "-c"]
    assert "/health" in model["healthcheck"]["test"][3]
    assert model["restart"] == "unless-stopped"
    assert model["mem_limit"] == "2304m"
    assert model["pids_limit"] == 256


def test_each_proxy_has_one_app_network_alias_and_no_model_or_database_mount():
    compose = config()
    networks = compose["networks"]
    assert networks["production_application"] == {
        "external": True,
        "name": "${PRODUCTION_APPLICATION_NETWORK:-shop3i-production_application}",
    }
    assert networks["testing_application"] == {
        "external": True,
        "name": "${TESTING_APPLICATION_NETWORK:-shop3i-testing_application}",
    }
    gateway_image = yaml.safe_load(
        (ROOT / "compose.server.services.yaml").read_text(encoding="utf-8")
    )["services"]["service-gateway"]["image"]
    for stage in ("production", "testing"):
        proxy = compose["services"][f"{stage}-proxy"]
        assert proxy["image"] == gateway_image
        assert proxy["pull_policy"] == "never"
        assert proxy["networks"] == {
            "inference": {},
            f"{stage}_application": {"aliases": ["functiongemma"]},
        }
        assert proxy["volumes"] == [
            "./docker/shared-inference/Caddyfile:/etc/caddy/Caddyfile:ro"
        ]
        assert proxy["read_only"] is True
        assert proxy["tmpfs"] == ["/config:size=16m", "/data:size=16m"]
        assert proxy["depends_on"]["shared-model"]["condition"] == "service_healthy"
        assert proxy["restart"] == "unless-stopped"
        assert proxy["cap_add"] == ["NET_BIND_SERVICE"]
        assert proxy["healthcheck"]["test"][-1] == "http://127.0.0.1:8000/health"
        assert "environment" not in proxy and "env_file" not in proxy


def test_no_shared_service_has_host_ports_or_privileged_networking():
    for name, service in config()["services"].items():
        assert "ports" not in service and "expose" not in service, name
        assert service.get("network_mode") != "host", name
        assert service.get("privileged") is not True, name
        assert service["security_opt"] == ["no-new-privileges:true"]
        assert service["cap_drop"] == ["ALL"]
        assert service["mem_limit"] and service["pids_limit"]


def test_proxy_routes_only_three_methods_and_paths_to_one_fixed_upstream():
    caddy = PROXY.read_text(encoding="utf-8")
    assert "admin off" in caddy
    assert "auto_https off" in caddy
    assert "method GET\n        path /health" in caddy
    assert "method POST\n        path /infer /v1/chat/completions" in caddy
    assert caddy.count("reverse_proxy shared-model:8000") == 2
    assert caddy.count("reverse_proxy ") == 2
    assert 'respond "Not found" 404' in caddy
    assert "{$" not in caddy and "${" not in caddy


def test_app_default_keeps_the_proxy_alias_contract():
    server = yaml.safe_load((ROOT / "compose.server.yaml").read_text(encoding="utf-8"))
    for name in ("backend", "worker"):
        assert server["services"][name]["environment"]["FUNCTIONGEMMA_URL"] == (
            "${FUNCTIONGEMMA_URL:-http://functiongemma:8000}"
        )
