"""Unit contract tests for the Python SDK and both adapters."""

import io
import json
import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "interfaces/python/shop3i"))

from shop3i import AssistantClient, AssistantError, Conversation
from shop3i.cli import run
from shop3i.data import TransportFailure
from shop3i.mcp import Server, serve

OP = str(uuid.uuid4())
CONV = str(uuid.uuid4())
ACTION = {"name": "catalog", "parameters": {"type": "object", "properties": {}}, "confirmation_required": False,
          "description": "List products"}


class FakeHTTP:
    def __init__(self, reply=None):
        self.calls = []
        self.reply = reply or []

    def __call__(self, method, url, headers, body):
        self.calls.append((method, url, headers, body))
        item = self.reply.pop(0)
        if isinstance(item, Exception):
            raise item
        status, data = item
        return status, {"Content-Type": "application/json"}, json.dumps(data).encode()


def accepted(url=None):
    return 202, {"operation_id": OP, "status": "queued", "poll_url": url or f"/api/v1/shops/fashion/operations/{OP}"}


def terminal(result, status="succeeded", code=200):
    return 200, {"operation_id": OP, "status": status, "http_status": code, "result": result}


class ClientTests(unittest.TestCase):
    def client(self, replies, **kwargs):
        fake = FakeHTTP(replies)
        return AssistantClient("http://localhost:8088", "fashion", transport=fake, sleep=lambda _: None, **kwargs), fake

    def test_discover_and_session_key_reuse(self):
        replies = [accepted(), terminal({"status": "draft", "role": "guest", "available_actions": [ACTION]}),
                   accepted(), terminal({"status": "completed", "conversation_id": CONV, "conversation_version": 1,
                                          "available_actions": [ACTION], "api_result": {"products": {"data": []}}})]
        client, fake = self.client(replies)
        self.assertEqual(client.discover()["role"], "guest")
        self.assertEqual(client.invoke("catalog")["status"], "completed")
        posts = [call for call in fake.calls if call[0] == "POST"]
        self.assertEqual(posts[0][2]["X-Operation-Token"], posts[1][2]["X-Operation-Token"])
        self.assertNotEqual(posts[0][2]["Idempotency-Key"], posts[1][2]["Idempotency-Key"])

    def test_retry_reuses_key_and_payload(self):
        client, fake = self.client([TransportFailure(), accepted(), terminal({"status": "needs_confirmation", "conversation_id": CONV, "conversation_version": 1})])
        result = client.invoke("checkout", {"shipping_address": {"name": "A"}})
        self.assertEqual(result["status"], "needs_confirmation")
        self.assertEqual(fake.calls[0][2]["Idempotency-Key"], fake.calls[1][2]["Idempotency-Key"])
        self.assertEqual(fake.calls[0][3], fake.calls[1][3])

    def test_confirm_is_separate_turn(self):
        client, fake = self.client([accepted(), terminal({"status": "completed", "conversation_id": CONV, "conversation_version": 2})])
        client.confirm(Conversation(CONV, 1, "needs_confirmation"))
        self.assertEqual(fake.calls[0][3], {"conversation_id": CONV, "conversation_version": 1, "confirm": True})

    def test_poll_url_is_constrained(self):
        for url in ["https://evil.test/x", f"/api/v1/shops/electronics/operations/{OP}",
                    f"/api/v1/shops/fashion/operations/{OP}?x=1", f"//evil.test/api/v1/shops/fashion/operations/{OP}"]:
            client, fake = self.client([accepted(url)])
            with self.assertRaises(AssistantError):
                client.discover()
            self.assertEqual(len(fake.calls), 1)

    def test_rejections_and_bad_payloads(self):
        cases = [([(403, {})], "assistant_http"),
                 ([accepted(), terminal({"validation_error": {}}, "rejected", 422)], "operation_rejected"),
                 ([accepted(), terminal({"status": "other"})], "invalid_body"),
                 ([accepted(), (200, {"operation_id": OP, "status": "surprise"})], "invalid_body")]
        for replies, code in cases:
            with self.subTest(code=code):
                client, _ = self.client(replies)
                with self.assertRaises(AssistantError) as error:
                    client.turn({"discover": True})
                self.assertEqual(error.exception.code, code)

    def test_state_and_input_bounds(self):
        for origin in ["http://example.test", "https://user:pass@example.test", "https://example.test/x"]:
            with self.assertRaises(ValueError):
                AssistantClient(origin, "fashion")
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "receipt.json"
            first = AssistantClient("http://localhost:8088", "fashion", state_file=path)
            second = AssistantClient("http://localhost:8088", "fashion", state_file=path)
            self.assertEqual(first.receipt, second.receipt)
            with self.assertRaises(ValueError):
                AssistantClient("http://localhost:8088", "electronics", state_file=path)
        client, _ = self.client([])
        for call in [lambda: client.chat(""), lambda: client.invoke("", {}),
                     lambda: client.confirm({"conversation_id": "bad", "conversation_version": 0})]:
            with self.assertRaises(ValueError):
                call()


class AdapterTests(unittest.TestCase):
    def test_cli_and_mcp_share_client(self):
        class FakeClient:
            def __init__(self):
                self.calls = []

            def discover(self):
                self.calls.append("discover")
                return {"status": "draft", "role": "guest", "available_actions": [ACTION]}

            def invoke(self, name, data, conversation):
                self.calls.append((name, data, conversation))
                return {"status": "completed"}

            def chat(self, message, conversation):
                self.calls.append((message, conversation))
                return {"status": "needs_confirmation", "conversation_id": CONV, "conversation_version": 1}

            def confirm(self, conversation):
                self.calls.append(conversation)
                return {"status": "completed"}

        fake = FakeClient()
        out = io.StringIO()
        self.assertEqual(run(["invoke", "catalog", "--data", "{}"], client_factory=lambda **_: fake, out=out), 0)
        self.assertEqual(fake.calls[-1], ("catalog", {}, None))
        server = Server(fake)
        self.assertEqual(server.dispatch({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}})["result"]["protocolVersion"], "2025-06-18")
        catalog = server.dispatch({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})["result"]["tools"]
        self.assertIn("shop3i_catalog", [tool["name"] for tool in catalog])
        response = server.dispatch({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "shop3i_catalog", "arguments": {"data": {}}}})
        self.assertEqual(json.loads(response["result"]["content"][0]["text"])["status"], "completed")
        denied = server.dispatch({"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "shop3i_deleteProduct", "arguments": {}}})
        self.assertTrue(denied["result"]["isError"])
        stream = io.StringIO('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}\n')
        output = io.StringIO()
        serve(fake, stream, output)
        self.assertEqual(len(output.getvalue().splitlines()), 1)

    def test_confirm_needs_persistent_receipt(self):
        error = io.StringIO()
        old = os.environ.pop("SHOP3I_OPERATION_TOKEN", None)
        try:
            self.assertEqual(run(["confirm", "--conversation", json.dumps({"conversation_id": CONV, "conversation_version": 1})], err=error), 1)
        finally:
            if old:
                os.environ["SHOP3I_OPERATION_TOKEN"] = old
        self.assertIn("requires", error.getvalue())


if __name__ == "__main__":
    unittest.main()
