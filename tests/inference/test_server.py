import json
import runpy
from http.server import ThreadingHTTPServer
from threading import Thread
from unittest.mock import Mock

import httpx
import pytest
import server


@pytest.fixture
def endpoint(monkeypatch):
    model = Mock()
    model.infer.return_value = {"name": "catalog", "arguments": {}}
    monkeypatch.setattr(server, "engine", model)
    http = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
    thread = Thread(target=http.serve_forever, daemon=True)
    thread.start()
    with httpx.Client(
        base_url=f"http://127.0.0.1:{http.server_port}", trust_env=False
    ) as client:
        yield client, model
    http.shutdown()
    http.server_close()
    thread.join()


def test_http_health_valid_body_and_invalid_paths(endpoint, monkeypatch):
    client, model = endpoint
    assert client.get("/health").json()["ready"] is True
    assert (
        client.post("/infer", json={"message": "products"}).json()["name"] == "catalog"
    )
    assert client.post("/other", json={}).status_code == 404
    assert client.post("/infer", content="").status_code == 413
    assert client.post("/infer", content="x" * 65537).status_code == 413
    assert client.post("/infer", content="bad json").status_code == 422
    model.infer.side_effect = RuntimeError("private failure")
    assert client.post("/infer", json={}).json() == {"error": "Inference unavailable"}
    monkeypatch.setattr(server, "engine", None)
    assert client.get("/health").status_code == 503
    assert client.post("/infer", json={}).status_code == 503


def test_sdk_chat_transport_returns_one_proposal_without_execution(endpoint):
    client, model = endpoint
    request = {
        "model": "google/functiongemma-270m-it",
        "messages": [{"role": "system", "content": "Select a tool"},
                     {"role": "user", "content": "Show products"}],
        "tools": [{"type": "function", "function": {"name": "catalog"}}],
        "collected": {"search": "shirt"},
    }
    response = client.post("/v1/chat/completions", json=request)
    assert response.status_code == 200
    result = response.json()
    assert result["choices"][0]["finish_reason"] == "tool_calls"
    call = result["choices"][0]["message"]["tool_calls"][0]
    assert call["function"]["name"] == "catalog"
    assert json.loads(call["function"]["arguments"]) == {}
    model.infer.assert_called_once_with({
        "message": "Show products", "tools": request["tools"],
        "collected": {"search": "shirt"},
    })
    request["messages"] = request["messages"][1:]
    del request["collected"]
    assert client.post("/v1/chat/completions", json=request).status_code == 200


@pytest.mark.parametrize("patch", [
    None, [], {"model": "other"}, {"stream": True}, {"messages": None},
    {"messages": []}, {"messages": [{"role": "assistant"}]},
    {"messages": [None]},
    {"messages": [None, {"role": "user"}]},
    {"messages": [{"role": "user", "content": "bad"}, {"role": "user"}]},
    {"messages": [{"role": "system", "content": None}, {"role": "user"}]},
])
def test_sdk_transport_rejects_invalid_chat_requests(endpoint, patch):
    client, model = endpoint
    request = {
        "model": "google/functiongemma-270m-it",
        "messages": [{"role": "user", "content": "Show products"}],
    }
    body = request | patch if isinstance(patch, dict) else patch
    assert client.post("/v1/chat/completions", content=json.dumps(body)).status_code == 422
    model.infer.assert_not_called()


@pytest.mark.parametrize("failure", [False, True])
def test_startup_reports_model_unavailable_without_disclosing_secrets(
    monkeypatch, failure
):
    factory = Mock(side_effect=RuntimeError("private") if failure else None)
    monkeypatch.setattr("engine.Engine", factory)
    transport = Mock()
    monkeypatch.setattr("http.server.ThreadingHTTPServer", transport)
    runpy.run_path(server.__file__, run_name="__main__")
    transport.return_value.serve_forever.assert_called_once()
