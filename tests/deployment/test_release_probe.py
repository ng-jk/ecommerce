import io
import json
import runpy

import pytest

from tools import release_probe as probe

URL = "https://api.example.test/api/v1/shops/fashion/products"
ID = "11111111-1111-4111-8111-111111111111"
POLL = "/api/v1/shops/fashion/operations/" + ID
ACCEPTED = {"operation_id": ID, "poll_url": POLL}
DONE = {
    "operation_id": ID,
    "status": "succeeded",
    "http_status": 200,
    "result": {"products": {"data": [], "meta": {}}},
}


def fake(monkeypatch, responses):
    calls = []

    def open_(request, timeout):
        calls.append(request)
        status, data, *redirect = responses.pop(0)
        response = io.StringIO(json.dumps(data))
        response.status = status
        response.url = redirect[0] if redirect else request.full_url
        return response

    monkeypatch.setattr(probe, "urlopen", open_)
    monkeypatch.setattr(probe.time, "sleep", lambda seconds: None)
    return calls


def test_worker_completes_durable_catalog_and_receipt_is_reused(monkeypatch):
    calls = fake(
        monkeypatch,
        [
            (202, ACCEPTED),
            (200, {"operation_id": ID, "status": "processing"}),
            (200, DONE),
        ],
    )
    probe.probe(URL)
    assert len(calls) == 3
    assert all(
        call.get_header("User-agent") == "Shop3i-Release-Healthcheck/1.0"
        for call in calls
    )
    assert calls[0].get_header("X-operation-token") == calls[2].get_header(
        "X-operation-token"
    )
    assert calls[1].full_url == "https://api.example.test" + POLL


@pytest.mark.parametrize(
    "responses",
    [
        [(200, ACCEPTED)],
        [(202, {**ACCEPTED, "poll_url": "https://evil.test"})],
        [(202, ACCEPTED, "https://evil.test")],
        [(202, ACCEPTED), (500, DONE)],
        [(202, ACCEPTED), (200, {**DONE, "operation_id": "wrong"})],
        [(202, ACCEPTED), (200, {**DONE, "status": "failed"})],
        [(202, ACCEPTED), (200, {**DONE, "result": {}})],
    ],
)
def test_worker_readiness_fails_closed(monkeypatch, responses):
    fake(monkeypatch, responses)
    with pytest.raises(ValueError):
        probe.probe(URL)


def test_worker_deadline_and_insecure_url(monkeypatch):
    fake(monkeypatch, [(202, ACCEPTED)])
    with pytest.raises(ValueError):
        probe.probe("http://api.example.test/products")
    with pytest.raises(TimeoutError):
        probe.probe(URL, timeout=0)


def test_cli_dispatch_and_help(monkeypatch):
    monkeypatch.setattr("sys.argv", ["release_probe.py", URL])
    calls = []
    monkeypatch.setattr(probe, "probe", calls.append)
    probe.main()
    assert calls == [URL]
    monkeypatch.setattr("sys.argv", ["release_probe.py", "--help"])
    with pytest.raises(SystemExit) as result:
        runpy.run_path(probe.__file__, run_name="__main__")
    assert result.value.code == 0


def test_redirect_handler_does_not_forward_readiness_receipts():
    assert (
        probe.NoRedirect().redirect_request(
            None, None, 302, None, None, "https://evil.test"
        )
        is None
    )
