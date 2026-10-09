# Shop3i Python assistant interface

Install locally with `python -m pip install ./interfaces/python/shop3i` or set
`PYTHONPATH=interfaces/python/shop3i`. Python 3.11+ and the standard library are
the only runtime requirements.

Set `SHOP3I_BASE_URL` to the API origin, `SHOP3I_SHOP` to `fashion` or
`electronics`, and optionally `SHOP3I_BEARER_TOKEN`. The SDK also accepts these
as constructor arguments; CLI and MCP read credentials only from environment.
HTTP is permitted only for loopback development. No token is printed in errors.

CLI examples:

```text
shop3i list
shop3i --state-file /private/shop3i-receipt.json invoke checkout --data '{"shipping_address":{"name":"..."}}'
shop3i --state-file /private/shop3i-receipt.json confirm --conversation '{"conversation_id":"...","conversation_version":1}'
shop3i chat "Show me products"
```

`invoke` and `chat` return the server result. If it says
`needs_confirmation`, review its preview and send a separate `confirm` turn
with the returned conversation ID and version. Never automatically confirm a
write. A new CLI process needs the same operation receipt: use a private state
file outside the repository or `SHOP3I_OPERATION_TOKEN` containing the same
64-character lowercase hex receipt. State files are created exclusively; on
POSIX they have mode 0600 and existing broader permissions are refused. On
Windows, place them in a user-private directory with a restricted ACL. The
SDK never persists a bearer token. Omit receipt state for one-process use.

The SDK exposes `AssistantClient.discover`, `invoke`, `chat`, `confirm`, `turn`
and `resume`. Every turn uses a fresh UUID idempotency key, and retries of that
turn reuse the same key and payload. If a request times out ambiguously, pass
the `AssistantError.key` to `turn(body, key=...)`; if you have an accepted operation,
retain `AssistantError.pending` and call `resume` without resubmitting. A client
session keeps one operation receipt across all turns.

`shop3i-mcp` serves newline-framed JSON-RPC over stdin/stdout. It supports MCP
protocol version `2025-06-18`: `initialize`, `notifications/initialized`,
`ping`, `tools/list`, and `tools/call`, plus standard JSON-RPC error replies.
`tools/list` reads live authorized discovery each time. `shop3i_confirm` is a
separate explicit tool; listed business tools only propose or execute according
to the server's confirmation policy. The server sends protocol output only to
stdout. Its receipt lasts for the server process unless explicitly supplied
through `SHOP3I_OPERATION_TOKEN`.
The supported methods follow the [MCP 2025-06-18 stdio transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports),
[lifecycle](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle),
and [tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
contracts. This deliberately implements that pinned protocol subset without a
third-party runtime package.

Run offline tests with `python -m unittest discover -s tests/interfaces -v`.
