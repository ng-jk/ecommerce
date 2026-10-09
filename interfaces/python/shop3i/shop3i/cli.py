"""Explicit assistant turns from a shell. Secrets are read from environment only."""

import argparse
import json
import os
import sys

from .logic import AssistantError, from_environment


def _json_object(value):
    try:
        parsed = json.loads(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("Expected a JSON object") from exc
    if not isinstance(parsed, dict):
        raise argparse.ArgumentTypeError("Expected a JSON object")
    return parsed


def build_parser():
    parser = argparse.ArgumentParser(prog="shop3i")
    parser.add_argument("--state-file", help="Private receipt state; required to confirm across processes unless SHOP3I_OPERATION_TOKEN is set")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list")
    invoke = sub.add_parser("invoke")
    invoke.add_argument("action")
    invoke.add_argument("--data", type=_json_object, default={})
    invoke.add_argument("--conversation", type=_json_object)
    chat = sub.add_parser("chat")
    chat.add_argument("message")
    chat.add_argument("--conversation", type=_json_object)
    confirm = sub.add_parser("confirm")
    confirm.add_argument("--conversation", type=_json_object, required=True)
    return parser


def run(argv=None, *, client_factory=from_environment, out=sys.stdout, err=sys.stderr):
    args = build_parser().parse_args(argv)
    try:
        if args.command == "confirm" and not args.state_file and not os.environ.get("SHOP3I_OPERATION_TOKEN"):
            raise ValueError("Confirm requires --state-file or SHOP3I_OPERATION_TOKEN from the proposal session")
        client = client_factory(state_file=args.state_file)
        if args.command == "list":
            result = client.discover()
        elif args.command == "invoke":
            result = client.invoke(args.action, args.data, args.conversation)
        elif args.command == "chat":
            result = client.chat(args.message, args.conversation)
        else:
            result = client.confirm(args.conversation)
        print(json.dumps(result), file=out)
        return 0
    except (AssistantError, ValueError) as exc:
        print(json.dumps({"error": getattr(exc, "code", "invalid_request"), "message": str(exc),
                          "http_status": getattr(exc, "http_status", None),
                          "operation_id": getattr(exc, "operation_id", None),
                          "idempotency_key": getattr(exc, "key", None)}), file=err)
        return 1


def main():
    raise SystemExit(run())
