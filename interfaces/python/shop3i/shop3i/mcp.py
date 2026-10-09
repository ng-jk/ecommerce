"""Minimal MCP 2025-06-18 stdio JSON-RPC server.

Supports initialize, ping, tools/list, tools/call and notifications/initialized.
Each line is one UTF-8 JSON-RPC message; stdout carries protocol frames only.
Protocol sources:
https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
https://modelcontextprotocol.io/specification/2025-06-18/server/tools
"""

import json
import sys

from .logic import AssistantError, from_environment

PROTOCOL = "2025-06-18"


def _tool(name, description, schema):
    return {"name": name, "description": description, "inputSchema": schema}


def _schema(properties, required=()):
    return {"type": "object", "properties": properties, "required": list(required), "additionalProperties": False}


class Server:
    def __init__(self, client):
        self.client = client
        self.initialized = False

    def _catalog(self):
        discovered = self.client.discover()
        tools = [_tool("shop3i_discover", "List actions currently authorized for this caller", _schema({})),
                 _tool("shop3i_chat", "Start or continue a natural-language proposal; never confirms it", _schema({"message": {"type": "string"}, "conversation": {"type": "object"}}, ("message",))),
                 _tool("shop3i_confirm", "Explicitly confirm the exact preview and version from an earlier turn", _schema({"conversation": {"type": "object"}}, ("conversation",)))]
        for action in discovered["available_actions"]:
            tools.append(_tool("shop3i_" + action["name"], action.get("description", action["name"]),
                               _schema({"data": action["parameters"], "conversation": {"type": "object"}})))
        return tools

    def _call(self, name, arguments):
        if not isinstance(name, str) or not isinstance(arguments, dict):
            raise TypeError("Invalid tool call")
        if name == "shop3i_discover":
            return self.client.discover()
        if name == "shop3i_chat":
            return self.client.chat(arguments.get("message"), arguments.get("conversation"))
        if name == "shop3i_confirm":
            return self.client.confirm(arguments.get("conversation"))
        current = {"shop3i_" + a["name"]: a for a in self.client.discover()["available_actions"]}
        if name not in current:
            raise ValueError("Action is not available to this caller")
        return self.client.invoke(current[name]["name"], arguments.get("data", {}), arguments.get("conversation"))

    def dispatch(self, message):
        if not isinstance(message, dict) or message.get("jsonrpc") != "2.0" or not isinstance(message.get("method"), str):
            return self._error(message.get("id") if isinstance(message, dict) else None, -32600, "Invalid Request")
        method, identifier = message["method"], message.get("id")
        if "id" not in message:
            return None
        try:
            if method == "initialize":
                params = message.get("params", {})
                if not isinstance(params, dict) or params.get("protocolVersion") != PROTOCOL:
                    raise ValueError("Invalid initialize parameters")
                self.initialized = True
                result = {"protocolVersion": PROTOCOL, "capabilities": {"tools": {"listChanged": False}},
                          "serverInfo": {"name": "shop3i", "version": "0.1.0"}}
            elif not self.initialized:
                return self._error(identifier, -32000, "Server is not initialized")
            elif method == "ping":
                result = {}
            elif method == "tools/list":
                result = {"tools": self._catalog()}
            elif method == "tools/call":
                params = message.get("params")
                if not isinstance(params, dict):
                    raise ValueError("Invalid tool parameters")
                result = {"content": [{"type": "text", "text": json.dumps(self._call(params.get("name"), params.get("arguments", {})))}]}
            else:
                return self._error(identifier, -32601, "Method not found")
            return {"jsonrpc": "2.0", "id": identifier, "result": result}
        except (AssistantError, TypeError, ValueError) as exc:
            if method == "tools/call":
                return {"jsonrpc": "2.0", "id": identifier, "result": {"content": [{"type": "text", "text": json.dumps({"error": getattr(exc, "code", "invalid_request"), "message": str(exc)})}], "isError": True}}
            return self._error(identifier, -32602, str(exc))

    @staticmethod
    def _error(identifier, code, message):
        return {"jsonrpc": "2.0", "id": identifier, "error": {"code": code, "message": message}}


def serve(client, incoming=sys.stdin, outgoing=sys.stdout):
    server = Server(client)
    for line in incoming:
        try:
            message = json.loads(line)
            response = server.dispatch(message)
        except ValueError:
            response = Server._error(None, -32700, "Parse error")
        if response is not None:
            outgoing.write(json.dumps(response, separators=(",", ":")) + "\n")
            outgoing.flush()


def main():
    try:
        serve(from_environment())
    except (ValueError, AssistantError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from exc
