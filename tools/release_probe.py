"""Anonymous durable catalog query proves HTTP ingress and worker readiness."""

import argparse
import json
import time
import uuid
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


urlopen = build_opener(NoRedirect()).open


def probe(url, timeout=120):
    parsed = urlsplit(url)
    if (
        parsed.scheme != "https"
        or parsed.username
        or parsed.password
        or not parsed.path.endswith("/products")
    ):
        raise ValueError("Worker readiness requires an HTTPS public catalog URL")
    headers = {
        "Accept": "application/json",
        "Idempotency-Key": str(uuid.uuid4()),
        "X-Operation-Token": uuid.uuid4().hex + uuid.uuid4().hex,
    }

    def get(target):
        with urlopen(Request(target, headers=headers), timeout=10) as response:
            if response.url != target:
                raise ValueError("Readiness redirects are not permitted")
            return response.status, json.load(response)

    status, accepted = get(url)
    if status != 202:
        raise ValueError("Catalog did not durably accept readiness query")
    operation = str(uuid.UUID(accepted["operation_id"]))
    expected = parsed.path.removesuffix("/products") + "/operations/" + operation
    if accepted.get("poll_url") != expected:
        raise ValueError("Unexpected readiness operation location")
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        status, result = get(parsed.scheme + "://" + parsed.netloc + expected)
        if status != 200 or result.get("operation_id") != operation:
            raise ValueError("Invalid readiness operation response")
        if result.get("status") == "succeeded":
            page = result.get("result", {}).get("products", {})
            if (
                result.get("http_status") != 200
                or not isinstance(page.get("data"), list)
                or not isinstance(page.get("meta"), dict)
            ):
                raise ValueError("Worker readiness returned invalid catalog")
            return
        if result.get("status") not in ["queued", "processing"]:
            raise ValueError("Worker rejected readiness query")
        time.sleep(1)
    raise TimeoutError("Worker did not finish readiness query")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url")
    probe(parser.parse_args().url)


if __name__ == "__main__":
    main()
