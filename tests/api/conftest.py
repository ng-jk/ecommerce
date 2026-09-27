"""Record sanitized wire exchanges and require every documented API operation."""

import json
import re
import threading
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[2]
REDACT = re.compile(r"password|token|cookie|authorization|receipt|email|signature", re.IGNORECASE)


def sanitize(value):
    if isinstance(value, dict):
        return {
            key: "[REDACTED]" if REDACT.search(key) else sanitize(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [sanitize(item) for item in value]
    return value


def body(raw):
    if not raw:
        return None
    try:
        return sanitize(json.loads(raw))
    except (ValueError, UnicodeDecodeError):
        return "[non-JSON body omitted]"


@pytest.fixture(scope="session", autouse=True)
def api_evidence(request):
    exchanges = []
    lock = threading.Lock()
    original = httpx.Client.send
    active = {"case": "setup"}

    def send(client, outgoing, *args, **kwargs):
        response = original(client, outgoing, *args, **kwargs)
        response.read()
        with lock:
            exchanges.append(
                {
                    "case": active["case"],
                    "request": {
                        "method": outgoing.method,
                        "path": outgoing.url.path,
                        "query": str(outgoing.url.query, "utf-8"),
                        "headers": sanitize(dict(outgoing.headers)),
                        "body": body(outgoing.content),
                    },
                    "response": {
                        "status": response.status_code,
                        "headers": sanitize(dict(response.headers)),
                        "body": body(response.content),
                    },
                }
            )
        return response

    httpx.Client.send = send
    yield active
    httpx.Client.send = original
    output = ROOT / "test-results/api"
    output.mkdir(parents=True, exist_ok=True)
    (output / "exchanges.json").write_text(
        json.dumps(exchanges, indent=2), encoding="utf-8"
    )
    document = json.loads((ROOT / "docs/openapi.json").read_text())
    terminal = {}
    payment_events = {}
    for exchange in exchanges:
        result = exchange["response"]["body"]
        if isinstance(result, dict) and result.get("status") in {
            "succeeded",
            "rejected",
            "failed",
        } and result.get("operation_id"):
            terminal[result["operation_id"]] = result
        event_match = re.fullmatch(
            r"/api/v1/payment-integrations/[^/]+/(\d+)",
            exchange["request"]["path"],
        )
        if (
            event_match
            and exchange["request"]["method"] == "GET"
            and isinstance(result, dict)
            and result.get("status") in {"queued", "processed", "rejected"}
        ):
            payment_events[int(event_match.group(1))] = result["status"]
    operations = []
    for path, reference in document["paths"].items():
        definition = json.loads((ROOT / "docs" / reference["$ref"]).read_text())
        pattern = re.compile("^" + re.sub(r"\{[^}]+\}", "[^/]+", path) + "$")
        for method in definition:
            if method not in {"get", "post", "put", "patch", "delete"}:
                continue
            matches = [
                entry
                for entry in exchanges
                if entry["request"]["method"] == method.upper()
                and pattern.fullmatch(entry["request"]["path"])
            ]
            operations.append(
                {
                    "method": method.upper(),
                    "path": path,
                    "requests": len(matches),
                    "statuses": sorted(
                        {entry["response"]["status"] for entry in matches}
                    ),
                    "successful_requests": sum(
                        200 <= entry["response"]["status"] < 300
                        and (
                            entry["response"]["status"] != 202
                            or (
                                isinstance(entry["response"]["body"], dict)
                                and (
                                    terminal.get(
                                        entry["response"]["body"].get("operation_id"), {}
                                    ).get("status")
                                    == "succeeded"
                                    if entry["response"]["body"].get("operation_id")
                                    else (
                                        payment_events.get(
                                            entry["response"]["body"].get("event_id")
                                        )
                                        == "processed"
                                    )
                                )
                            )
                        )
                        for entry in matches
                    ),
                }
            )
    missing = [entry for entry in operations if not entry["requests"]]
    missing_success = [
        entry for entry in operations if not entry["successful_requests"]
    ]
    report = {
        "operations": operations,
        "missing": missing,
        "missing_success": missing_success,
        "endpoint_coverage_percent": 100
        * (len(operations) - len(missing))
        / len(operations),
        "tests_failed": request.session.testsfailed,
        "note": "Endpoint coverage measures exercised routes, not exhaustive input or code coverage.",
    }
    (output / "coverage.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )
    assert not missing, f"Untested documented API operations: {missing}"
    assert not missing_success, (
        f"API operations without verified success: {missing_success}"
    )


@pytest.fixture(autouse=True)
def api_case(api_evidence, request):
    api_evidence["case"] = request.node.nodeid
