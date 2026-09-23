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
