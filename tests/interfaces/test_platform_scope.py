"""The CLI/MCP shared SDK cannot cross platform and storefront identity scopes."""

import os
from unittest.mock import patch

import pytest

from test_shop3i import ACTION, OP, FakeHTTP, accepted, terminal
from shop3i import AssistantClient, AssistantError
from shop3i.logic import from_environment


def test_platform_discovery_uses_standalone_endpoint_and_private_receipt():
    transport = FakeHTTP([
        accepted(f"/api/v1/platform/operations/{OP}"),
        terminal({"status": "draft", "role": "platform", "available_actions": [ACTION]}),
    ])
    client = AssistantClient("http://localhost:8088", platform=True, token="synthetic-platform",
                             transport=transport, sleep=lambda _: None)
    assert client.discover()["role"] == "platform"
    assert transport.calls[0][1] == "http://localhost:8088/api/v1/platform/assistant"
    assert transport.calls[1][1] == f"http://localhost:8088/api/v1/platform/operations/{OP}"
    assert transport.calls[0][2]["Authorization"] == "Bearer synthetic-platform"
    assert transport.calls[0][2]["X-Operation-Token"] == transport.calls[1][2]["X-Operation-Token"]


@pytest.mark.parametrize("platform,shop", [(True, "fashion"), ("true", None), (1, None), (None, None)])
def test_scope_rejects_ambiguous_or_untyped_identity(platform, shop):
    with pytest.raises(ValueError):
        AssistantClient("http://localhost:8088", shop, platform=platform)


def test_platform_poll_cannot_follow_storefront_receipt():
    transport = FakeHTTP([accepted()])
    client = AssistantClient("http://localhost:8088", platform=True, transport=transport)
    with pytest.raises(AssistantError):
        client.discover()
    assert len(transport.calls) == 1


def test_platform_environment_requires_no_shop_and_rejects_stale_shop_setting():
    with patch.dict(os.environ, {"SHOP3I_SCOPE": "platform", "SHOP3I_BASE_URL": "https://shop3i.com"}, clear=True):
        assert from_environment().path == "/api/v1/platform"
        os.environ["SHOP3I_SHOP"] = "fashion"
        with pytest.raises(ValueError, match="must not specify a shop"):
            from_environment()
    with patch.dict(os.environ, {"SHOP3I_SCOPE": "other"}, clear=True):
        with pytest.raises(ValueError, match="SHOP3I_SCOPE"):
            from_environment()


def test_receipt_file_cannot_cross_identity_scope(tmp_path):
    # Receipt persistence is unit-tested with an isolated path outside the checkout.
    with patch("shop3i.logic.load_receipt", return_value={
        "origin": "https://shop3i.com", "shop": "fashion", "receipt": "a" * 64,
    }):
        with pytest.raises(ValueError, match="another origin or shop"):
            AssistantClient("https://shop3i.com", platform=True, state_file=tmp_path / "receipt")
