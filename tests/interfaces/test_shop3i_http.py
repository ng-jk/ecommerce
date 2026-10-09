"""Raw HTTP contract smoke test without a running Shop3i stack."""

import json
import sys
import threading
import unittest
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import ClassVar

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "interfaces/python/shop3i"))

from shop3i import AssistantClient


class Handler(BaseHTTPRequestHandler):
    calls: ClassVar[list] = []
    operation_id = str(uuid.uuid4())

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.calls.append((self.command, self.path, dict(self.headers), body))
        self.send_response(202)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"operation_id": self.operation_id, "status": "queued",
                                    "poll_url": f"/api/v1/shops/fashion/operations/{self.operation_id}"}).encode())

    def do_GET(self):
        self.calls.append((self.command, self.path, dict(self.headers), None))
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"operation_id": self.operation_id, "status": "succeeded", "http_status": 200,
                                    "result": {"status": "draft", "role": "guest", "available_actions": []}}).encode())

    def log_message(self, *_):
        pass


class RawHTTPTests(unittest.TestCase):
    def test_headers_paths_and_durable_result(self):
        Handler.calls = []
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            client = AssistantClient(f"http://127.0.0.1:{server.server_port}", "fashion")
            self.assertEqual(client.discover()["role"], "guest")
            self.assertEqual([c[0] for c in Handler.calls], ["POST", "GET"])
            self.assertEqual(Handler.calls[0][3], {"discover": True})
            self.assertEqual(Handler.calls[0][2]["X-Operation-Token"], Handler.calls[1][2]["X-Operation-Token"])
            self.assertEqual(Handler.calls[0][1], "/api/v1/shops/fashion/assistant")
            self.assertEqual(Handler.calls[1][1], f"/api/v1/shops/fashion/operations/{Handler.operation_id}")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
