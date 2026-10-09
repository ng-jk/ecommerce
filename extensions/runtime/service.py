"""Transport and worker composition for an independent plugin service."""

import asyncio
import json
import os
import uuid
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import psycopg

from .contracts import (
    Registry,
    Rejected,
    canonical,
    digest,
    invocation,
    package_bytes,
    require,
)
from .sandbox import DockerSandbox
from .storage import Storage


class Service:
    def __init__(self, registry, storage, sandbox):
        self.registry, self.storage, self.sandbox = registry, storage, sandbox

    def authenticate(self, installation, authorization):
        require(
            isinstance(authorization, str)
            and authorization.startswith("Bearer ")
            and 32 <= len(authorization[7:]) <= 256,
            "unauthenticated",
        )
        return self.registry.resolve(installation, digest(authorization[7:].encode()))

    def accept(self, installation, authorization, key, body):
        binding = self.authenticate(installation, authorization)
        payload = invocation(body)
        operation = self.storage.accept(binding, key, payload)
        return {
            "id": operation,
            "status": "accepted",
            "poll": f"/v1/installations/{installation}/operations/{operation}",
        }

    def poll(self, installation, authorization, operation):
        binding = self.authenticate(installation, authorization)
        return self.storage.poll(binding, str(uuid.UUID(operation)))

    def once(self):
        job = self.storage.claim()
        if job is None:
            return False
        try:
            binding = self.registry.resolve(job["installation"], job["caller"])
            require(
                binding.tenant == job["tenant"]
                and binding.sha256 == job["package_hash"],
                "installation_changed",
            )
            archive = package_bytes(binding)

            def rpc(sequence, request):
                current = self.registry.resolve(binding.installation, binding.caller)
                require(current == binding, "installation_changed")
                return self.storage.rpc(binding, job, sequence, request)

            result = asyncio.run(
                self.sandbox.execute(archive, invocation(job["payload"]), rpc)
            )
            require(
                self.registry.resolve(binding.installation, binding.caller) == binding,
                "installation_changed",
            )
            self.storage.complete(
                job,
                "succeeded",
                {"proposal": result, "authority": "requires_core_validation"},
            )
        except Rejected as error:
            self.storage.complete(job, "rejected", {"error": str(error)})
        except (
            OSError,
            ValueError,
            TypeError,
            KeyError,
            RuntimeError,
            psycopg.Error,
            zipfile.BadZipFile,
        ):
            # No exception details (paths, credentials, script output) cross transport.
            self.storage.complete(job, "failed", {"error": "plugin_execution_failed"})
        return True


def handler(service):
    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(10)

        def log_message(self, format, *args):
            pass

        def respond(self, status, payload):
            data = canonical(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def dispatch(self):
            try:
                parts = self.path.split("/")
                require(
                    len(parts) in (5, 6)
                    and parts[1:3] == ["v1", "installations"]
                    and parts[4] == "operations",
                    "route_missing",
                )
                auth = self.headers.get("Authorization")
                if self.command == "GET" and len(parts) == 6:
                    self.respond(200, service.poll(parts[3], auth, parts[5]))
                    return
                require(self.command == "POST" and len(parts) == 5, "route_missing")
                require(
                    self.headers.get("Content-Type") == "application/json"
                    and self.headers.get("Transfer-Encoding") is None,
                    "invalid_content_type",
                )
                length = int(self.headers.get("Content-Length", "0"))
                require(0 < length <= 8192, "invalid_body_length")
                body = json.loads(self.rfile.read(length))
                result = service.accept(
                    parts[3], auth, self.headers.get("Idempotency-Key"), body
                )
                self.respond(202, result)
            except Rejected as error:
                reason = str(error)
                status = {
                    "unauthenticated": 401,
                    "forbidden": 403,
                    "installation_unavailable": 403,
                    "operation_missing": 404,
                    "route_missing": 404,
                    "idempotency_conflict": 409,
                    "queue_full": 429,
                }.get(reason, 422)
                self.respond(status, {"error": reason})
            except (ValueError, TypeError):
                self.respond(422, {"error": "invalid_request"})
            except (OSError, KeyError, RuntimeError, psycopg.Error):
                self.respond(503, {"error": "service_unavailable"})

        do_GET = dispatch
        do_POST = dispatch

    return Handler


def main():
    import sys

    storage = Storage(os.environ["PLUGIN_DATABASE_URL"])
    role = sys.argv[1]
    if role == "migrate":
        storage.migrate()
        return
    registry = Registry(os.environ["PLUGIN_REGISTRY"])
    service = Service(
        registry, storage, DockerSandbox(os.environ["PLUGIN_SANDBOX_IMAGE"])
    )
    if role == "api":
        ThreadingHTTPServer(("0.0.0.0", 8090), handler(service)).serve_forever()
    else:
        require(role == "worker", "invalid_role")
        while True:
            if not service.once():
                storage.wait()


if __name__ == "__main__":
    main()
