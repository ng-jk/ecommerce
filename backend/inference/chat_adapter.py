"""Restricted Chat Completions transport for proposal-only Laravel AI agents."""

import json
import uuid


def infer_chat(engine, request):
    if not isinstance(request, dict):
        raise TypeError("Invalid request")
    if request.get("model") != "google/functiongemma-270m-it":
        raise ValueError("Unsupported model")
    if request.get("stream", False) is not False:
        raise ValueError("Streaming is unsupported")
    messages = request.get("messages")
    if not isinstance(messages, list) or not 1 <= len(messages) <= 2:
        raise ValueError("Invalid messages")
    if len(messages) == 2 and (
        not isinstance(messages[0], dict)
        or messages[0].get("role") not in {"system", "developer"}
        or not isinstance(messages[0].get("content"), str)
    ):
        raise ValueError("Invalid instructions")
    last = messages[-1]
    if not isinstance(last, dict) or last.get("role") != "user":
        raise ValueError("Expected user message")
    result = engine.infer({
        "message": last.get("content"),
        "tools": request.get("tools"),
        "collected": request.get("collected", {}),
    })
    return {
        "id": "chatcmpl-" + uuid.uuid4().hex,
        "object": "chat.completion",
        "model": request["model"],
        "choices": [{
            "index": 0,
            "finish_reason": "tool_calls",
            "message": {
                "role": "assistant",
                "content": None,
                "tool_calls": [{
                    "id": "call_" + uuid.uuid4().hex,
                    "type": "function",
                    "function": {
                        "name": result["name"],
                        "arguments": json.dumps(result["arguments"] or {}),
                    },
                }],
            },
        }],
    }
