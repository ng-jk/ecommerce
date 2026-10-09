"""Failure and protocol edges for owned Python interface code."""

import io
import json
import os
import runpy
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "interfaces/python/shop3i"))

from shop3i import AssistantClient, AssistantError, PendingTurn, cli, data, logic, mcp
from test_shop3i import ACTION, CONV, OP, FakeHTTP, accepted, terminal


class LogicEdges(unittest.TestCase):
    def client(self, replies=(), **options):
        transport = FakeHTTP(list(replies))
        client = AssistantClient("http://localhost:8088", "fashion", transport=transport,
                                 sleep=lambda _: None, **options)
        return client, transport

    def test_json_and_schema_rejection(self):
        for raw in [b"no", b"\xff", b"[]"]:
            with self.assertRaises(AssistantError):
                logic._object(raw)
        for result in [[], {"status": "oops"}, {"status": "draft", "available_actions": {}},
                       {"status": "draft", "available_actions": [None]},
                       {"status": "draft", "available_actions": [{"name": 3, "parameters": {}, "confirmation_required": False}]},
                       {"status": "draft", "available_actions": [{"name": "a", "parameters": [], "confirmation_required": False}]},
                       {"status": "draft", "available_actions": [{"name": "a", "parameters": {}, "confirmation_required": "no"}]},
                       {"status": "draft", "conversation_id": "bad", "conversation_version": 1},
                       {"status": "draft", "conversation_id": CONV, "conversation_version": True},
                       {"status": "draft", "conversation_id": CONV, "conversation_version": -1}]:
            with self.subTest(result=result), self.assertRaises(AssistantError):
                logic._result(result)
        self.assertTrue(logic._uuid(CONV))
        for bad in [None, 1, "bad"]:
            self.assertFalse(logic._uuid(bad))

    def test_constructor_boundaries_and_environment(self):
        for origin, shop in [("https://example.test", "wrong"), ("http://a.test", "fashion"),
                             ("https://example.test?x=1", "fashion"), ("https://example.test#x", "fashion"),
                             ("https://example.test/other", "fashion"), ("https://u@example.test", "fashion"),
                             ("ftp://example.test", "fashion"), ("https://", "fashion")]:
            with self.assertRaises(ValueError):
                AssistantClient(origin, shop)
        for options in [{"attempts": 0}, {"deadline": 0}, {"operation_token": "bad"}]:
            with self.assertRaises(ValueError):
                AssistantClient("https://example.test", "fashion", **options)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "receipt"
            first = AssistantClient("https://example.test", "fashion", state_file=path)
            with self.assertRaises(ValueError):
                AssistantClient("https://example.test", "fashion", state_file=path, operation_token="a" * 64)
            self.assertEqual(first.receipt, AssistantClient("https://example.test", "fashion", state_file=path, operation_token=first.receipt).receipt)
        with patch.dict(os.environ, {}, clear=True), self.assertRaises(ValueError):
            logic.from_environment()
        with patch.dict(os.environ, {"SHOP3I_BASE_URL": "https://example.test", "SHOP3I_SHOP": "fashion", "SHOP3I_BEARER_TOKEN": "secret"}, clear=True):
            self.assertEqual(logic.from_environment()._headers()["Authorization"], "Bearer secret")

    def test_http_failures_and_timeouts(self):
        client, _ = self.client([(503, {}), (503, {}), (503, {})])
        with self.assertRaises(AssistantError) as error:
            client.discover()
        self.assertEqual(error.exception.code, "transient")
        self.assertTrue(logic._uuid(error.exception.key))
        fake = lambda *_: (200, {"Content-Type": "text/html"}, b"{}")
        client, _ = self.client([])
        client.transport = fake
        with self.assertRaises(AssistantError):
            client.discover()
        pending = PendingTurn(OP, f"/api/v1/shops/fashion/operations/{OP}", str(uuid.uuid4()), {})
        for bad in [None, PendingTurn("bad", pending.poll_url, pending.key, {}), PendingTurn(OP, pending.poll_url, "bad", {})]:
            with self.assertRaises(ValueError):
                client.resume(bad)
        for response in [(404, {}), (200, {"operation_id": "bad", "status": "queued"}),
                         (200, {"operation_id": OP, "status": "succeeded", "http_status": "200", "result": {}}),
                         (200, {"operation_id": OP, "status": "succeeded", "http_status": 500, "result": {}})]:
            client, _ = self.client([response])
            with self.assertRaises(AssistantError):
                client.resume(pending)
        clock = iter([0, 0, 0, 2]).__next__
        client, _ = self.client([(200, {"operation_id": OP, "status": "queued"})], deadline=1, clock=clock)
        with self.assertRaises(AssistantError) as error:
            client.resume(pending)
        self.assertEqual(error.exception.pending, pending)

    def test_turn_and_conversation_input_boundaries(self):
        client, _ = self.client([])
        for body, key in [(None, None), ({}, "bad")]:
            with self.assertRaises((TypeError, ValueError)):
                client.turn(body, key=key)
        for result in [{"operation_id": "bad", "status": "queued"},
                       {"operation_id": OP, "status": "bad"}]:
            client, _ = self.client([(202, result)])
            with self.assertRaises(AssistantError):
                client.turn({})
        client, _ = self.client([accepted(), terminal({"status": "draft"})])
        with self.assertRaises(AssistantError):
            client.discover()
        client, _ = self.client([])
        for name, payload in [(None, {}), ("", {}), ("catalog", [])]:
            with self.assertRaises(ValueError):
                client.invoke(name, payload)
        for message in [None, "", "a" * 2001]:
            with self.assertRaises(ValueError):
                client.chat(message)
        for conversation in [None, {}, {"conversation_id": CONV, "conversation_version": -1},
                             {"conversation_id": CONV, "conversation_version": True}]:
            with self.assertRaises(ValueError):
                client.confirm(conversation)
        client, fake = self.client([accepted(), terminal({"status": "needs_input", "conversation_id": CONV, "conversation_version": 2}),
                                    accepted(), terminal({"status": "needs_confirmation", "conversation_id": CONV, "conversation_version": 3})])
        client.chat("More", {"conversation_id": CONV, "conversation_version": 1})
        client.invoke("catalog", {}, {"conversation_id": CONV, "conversation_version": 2})
        self.assertEqual(fake.calls[0][3]["conversation_version"], 1)
        self.assertEqual(fake.calls[2][3]["conversation_version"], 2)
        client, fake = self.client([accepted(), terminal({"status": "needs_confirmation", "conversation_id": CONV, "conversation_version": 1})])
        client.chat("Hello")
        self.assertEqual(fake.calls[0][3], {"message": "Hello"})


class DataEdges(unittest.TestCase):
    def test_state_validation_and_failure_cleanup(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "state"
            self.assertIsNone(data.load_receipt(path))
            path.write_text("[]", encoding="utf-8")
            with self.assertRaises(ValueError):
                data.load_receipt(path)
            path.unlink()
            path.mkdir()
            with self.assertRaises(ValueError):
                data.load_receipt(path)
            path.rmdir()
            data.save_receipt(path, {"origin": "a", "shop": "b", "receipt": "c"})
            self.assertEqual(data.load_receipt(path)["receipt"], "c")
            with patch("shop3i.data._is_posix", return_value=True), patch("shop3i.data.stat.S_IMODE", return_value=0o644), self.assertRaises(ValueError):
                data.load_receipt(path)
            with self.assertRaises(ValueError):
                data.save_receipt(path, {})
            path.unlink()
            with patch.object(data.json, "dump", side_effect=RuntimeError("disk")), self.assertRaises(RuntimeError):
                data.save_receipt(path, {})
            self.assertFalse(path.exists())
            git = Path(folder) / "checkout" / ".git"
            git.mkdir(parents=True)
            with self.assertRaises(ValueError):
                data.save_receipt(git.parent / "secret", {})
            (git.parent / "secret").write_text("{}", encoding="utf-8")
            with self.assertRaises(ValueError):
                data.load_receipt(git.parent / "secret")
            if hasattr(os, "symlink"):
                try:
                    path.symlink_to(git)
                except OSError:
                    pass
                else:
                    with self.assertRaises(ValueError):
                        data.load_receipt(path)

    def test_transport_http_error_and_network_error(self):
        from urllib.error import HTTPError, URLError
        self.assertIsNone(data._NoRedirect().redirect_request(None, None, 302, "redirect", {}, "http://evil.test"))
        http_error = HTTPError("http://localhost", 302, "redirect", {"Content-Type": "text/html"}, io.BytesIO(b"redirect"))
        with patch("shop3i.data.urllib.request.build_opener") as opener:
            opener.return_value.open.side_effect = http_error
            self.assertEqual(data.request("GET", "http://localhost", {})[0], 302)
            opener.return_value.open.side_effect = URLError("offline")
            with self.assertRaises(data.TransportFailure):
                data.request("GET", "http://localhost", {})


class McpEdges(unittest.TestCase):
    def test_protocol_errors_and_tools(self):
        class Client:
            def discover(self):
                return {"available_actions": [ACTION]}
            def chat(self, message, conversation):
                return {"message": message}
            def confirm(self, conversation):
                return {"confirmation": conversation}
            def invoke(self, name, data, conversation):
                return {"action": name}
        server = mcp.Server(Client())
        def call(method, params=None, identifier=1):
            return server.dispatch({"jsonrpc": "2.0", "id": identifier, "method": method, "params": params})
        self.assertEqual(call("ping")["error"]["code"], -32000)
        self.assertEqual(server.dispatch([])["error"]["code"], -32600)
        self.assertIsNone(server.dispatch({"jsonrpc": "2.0", "method": "notifications/initialized"}))
        self.assertEqual(call("initialize", {})["error"]["code"], -32602)
        call("initialize", {"protocolVersion": mcp.PROTOCOL})
        self.assertEqual(call("ping")["result"], {})
        self.assertEqual(call("bogus")["error"]["code"], -32601)
        self.assertEqual(call("tools/call", None)["result"]["isError"], True)
        for name, args in [("shop3i_discover", {}), ("shop3i_chat", {"message": "hello"}),
                           ("shop3i_confirm", {"conversation": {}})]:
            self.assertFalse(call("tools/call", {"name": name, "arguments": args})["result"].get("isError", False))
        self.assertTrue(call("tools/call", {"name": 1, "arguments": {}})["result"]["isError"])
        stream = io.StringIO("invalid\n" + json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n")
        output = io.StringIO()
        mcp.serve(Client(), stream, output)
        self.assertEqual(json.loads(output.getvalue())["error"]["code"], -32700)

    def test_entry_errors(self):
        with patch("shop3i.mcp.from_environment", side_effect=ValueError("missing")), patch("shop3i.mcp.sys.stderr", new_callable=io.StringIO) as err:
            with self.assertRaises(SystemExit):
                mcp.main()
            self.assertIn("missing", err.getvalue())
        with patch("shop3i.cli.run", return_value=7):
            with self.assertRaises(SystemExit) as exc:
                cli.main()
            self.assertEqual(exc.exception.code, 7)


class CliEdges(unittest.TestCase):
    def test_all_subcommands_and_json_parser(self):
        class Client:
            def discover(self):
                return {"status": "draft"}
            def chat(self, message, conversation):
                return {"message": message, "conversation": conversation}
            def confirm(self, conversation):
                return {"confirmed": conversation}
        factory = lambda **_: Client()
        for argv in [["list"], ["chat", "hello"], ["confirm", "--conversation", json.dumps({"conversation_id": CONV, "conversation_version": 1})]]:
            with self.subTest(argv=argv), patch.dict(os.environ, {"SHOP3I_OPERATION_TOKEN": "a" * 64}):
                output = io.StringIO()
                self.assertEqual(cli.run(argv, client_factory=factory, out=output), 0)
                self.assertTrue(json.loads(output.getvalue()))
        for raw in ["bad", "[]"]:
            with self.assertRaises(cli.argparse.ArgumentTypeError):
                cli._json_object(raw)
        with patch("shop3i.cli.main") as main:
            runpy.run_module("shop3i.__main__", run_name="__main__")
            main.assert_called_once()


if __name__ == "__main__":
    unittest.main()
