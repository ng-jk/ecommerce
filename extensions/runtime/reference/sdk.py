"""Plugin SDK v1: transport only; the broker supplies identity and grants."""

import json
import sys


def call(method, params):
    print(
        json.dumps({"rpc": {"method": method, "params": params}}, allow_nan=False),
        flush=True,
    )
    response = json.loads(sys.stdin.readline())
    return response["ok"]


def get(key):
    return call("storage.get", {"key": key})["value"]


def set_value(key, value):
    return call("storage.set", {"key": key, "value": value})


def finish(value):
    print(json.dumps({"result": value}, allow_nan=False), flush=True)
