"""Validated, bounded assistant conversation worker shared by every interface."""

import json
import os
import re
import secrets
import time
import uuid
from dataclasses import dataclass
from urllib.parse import urlsplit

from .data import TransportFailure, load_receipt, request, save_receipt


class AssistantError(Exception):
    def __init__(self, code, message, *, http_status=None, operation_id=None, pending=None, key=None):
        super().__init__(message)
        self.code = code
        self.http_status = http_status
        self.operation_id = operation_id
        self.pending = pending
        self.key = key


@dataclass(frozen=True)
class Conversation:
    id: str
    version: int
    status: str


@dataclass(frozen=True)
class PendingTurn:
    operation_id: str
    poll_url: str
    key: str
    body: dict


def _object(raw):
    try:
        value = json.loads(raw)
    except (ValueError, UnicodeDecodeError) as exc:
        raise AssistantError("invalid_body", "Shop3i returned invalid JSON") from exc
    if not isinstance(value, dict):
        raise AssistantError("invalid_body", "Shop3i returned an invalid object")
    return value


def _uuid(value):
    try:
        return str(uuid.UUID(value)) == value and isinstance(value, str)
    except (ValueError, TypeError, AttributeError):
        return False


def _result(value):
    if not isinstance(value, dict) or value.get("status") not in {"draft", "needs_input", "needs_confirmation", "completed"}:
        raise AssistantError("invalid_body", "Shop3i returned an invalid assistant result")
    if "available_actions" in value:
        actions = value["available_actions"]
        if not isinstance(actions, list) or any(not isinstance(a, dict) or not isinstance(a.get("name"), str) or not isinstance(a.get("parameters"), dict) or not isinstance(a.get("confirmation_required"), bool) for a in actions):
            raise AssistantError("invalid_body", "Shop3i returned invalid action discovery")
    if "conversation_id" in value and (not _uuid(value["conversation_id"]) or type(value.get("conversation_version")) is not int or value["conversation_version"] < 0):
        raise AssistantError("invalid_body", "Shop3i returned an invalid conversation")
    return value


class AssistantClient:
    def __init__(self, base_url, shop, *, token=None, operation_token=None, state_file=None,
                 transport=request, deadline=45, attempts=3, sleep=time.sleep, clock=time.monotonic):
        parsed = urlsplit(base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
            raise ValueError("base_url must be an origin")
        if parsed.scheme != "https" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError("HTTPS is required outside localhost")
        if not re.fullmatch(r"[a-z0-9-]+", shop) or shop not in {"fashion", "electronics"}:
            raise ValueError("Invalid shop")
        self.origin = base_url.rstrip("/")
        self.shop = shop
        self.path = f"/api/v1/shops/{shop}"
        self.token = token
        self.transport = transport
        self.deadline = deadline
        self.attempts = attempts
        self.sleep = sleep
        self.clock = clock
        if attempts < 1 or deadline <= 0:
            raise ValueError("Retry bounds must be positive")
        state = load_receipt(state_file) if state_file else None
        if state and (state["origin"] != self.origin or state["shop"] != shop):
            raise ValueError("Receipt state belongs to another origin or shop")
        receipt = operation_token or (state and state["receipt"]) or secrets.token_hex(32)
        if not isinstance(receipt, str) or not re.fullmatch(r"[a-f0-9]{64}", receipt):
            raise ValueError("Invalid operation token")
        if state and operation_token and operation_token != state["receipt"]:
            raise ValueError("Operation token conflicts with receipt state")
        self.receipt = receipt
        if state_file and not state:
            save_receipt(state_file, {"origin": self.origin, "shop": shop, "receipt": receipt})

    def _headers(self, key=None):
        headers = {"Accept": "application/json", "X-Operation-Token": self.receipt}
        if key:
            headers["Idempotency-Key"] = key
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        if key:
            headers["Content-Type"] = "application/json"
        return headers

    def _send(self, method, path, key=None, body=None):
        last = None
        for attempt in range(self.attempts):
            try:
                status, headers, raw = self.transport(method, self.origin + path, self._headers(key), body)
            except TransportFailure as exc:
                last = AssistantError("network", str(exc))
            else:
                if status in {408, 429, 500, 502, 503, 504}:
                    last = AssistantError("transient", "Shop3i is temporarily unavailable", http_status=status)
                else:
                    content_type = next((value for name, value in headers.items() if name.lower() == "content-type"), "")
                    if not content_type.lower().split(";", 1)[0].strip() == "application/json":
                        raise AssistantError("invalid_body", "Shop3i returned an unexpected content type", http_status=status)
                    return status, headers, _object(raw)
            if attempt + 1 < self.attempts:
                self.sleep(min(1.0, 0.1 * (2 ** attempt)))
        raise last

    def _poll_path(self, value, operation_id):
        exact = f"{self.path}/operations/{operation_id}"
        parsed = urlsplit(value) if isinstance(value, str) else None
        if not parsed or parsed.query or parsed.fragment or parsed.username or parsed.password:
            raise AssistantError("invalid_body", "Unsafe operation URL")
        if parsed.netloc and f"{parsed.scheme}://{parsed.netloc}" != self.origin:
            raise AssistantError("invalid_body", "Unsafe operation URL")
        if parsed.path != exact or (parsed.scheme and parsed.scheme != urlsplit(self.origin).scheme):
            raise AssistantError("invalid_body", "Unsafe operation URL")
        return exact

    def resume(self, pending):
        if not isinstance(pending, PendingTurn) or not _uuid(pending.operation_id) or not _uuid(pending.key):
            raise ValueError("Invalid pending turn")
        path = self._poll_path(pending.poll_url, pending.operation_id)
        stop = self.clock() + self.deadline
        delay = 0.05
        while self.clock() < stop:
            status, _, operation = self._send("GET", path)
            if status != 200:
                raise AssistantError("poll_http", "Operation lookup failed", http_status=status, operation_id=pending.operation_id)
            if operation.get("operation_id") != pending.operation_id or operation.get("status") not in {"queued", "processing", "succeeded", "rejected", "failed"}:
                raise AssistantError("invalid_body", "Shop3i returned an invalid operation")
            if operation["status"] in {"succeeded", "rejected", "failed"}:
                code = operation.get("http_status")
                result = operation.get("result")
                if type(code) is not int or not isinstance(result, dict):
                    raise AssistantError("invalid_body", "Shop3i returned an invalid operation result")
                if operation["status"] != "succeeded" or code >= 400:
                    raise AssistantError("operation_rejected", "Shop3i rejected the operation", http_status=code, operation_id=pending.operation_id)
                return _result(result)
            self.sleep(min(delay, max(0, stop - self.clock())))
            delay = min(0.5, delay * 1.5)
        raise AssistantError("timeout", "Operation is still pending; resume polling", operation_id=pending.operation_id, pending=pending)

    def turn(self, body, *, key=None):
        if not isinstance(body, dict):
            raise TypeError("Turn body must be an object")
        key = key or str(uuid.uuid4())
        if not _uuid(key):
            raise ValueError("Invalid idempotency key")
        try:
            status, _, accepted = self._send("POST", self.path + "/assistant", key, body)
        except AssistantError as exc:
            exc.key = key
            raise
        if status != 202:
            raise AssistantError("assistant_http", "Assistant request failed", http_status=status)
        operation_id = accepted.get("operation_id")
        if not _uuid(operation_id) or accepted.get("status") not in {"queued", "processing"}:
            raise AssistantError("invalid_body", "Shop3i returned an invalid acceptance")
        pending = PendingTurn(operation_id, accepted.get("poll_url"), key, body)
        self._poll_path(pending.poll_url, operation_id)
        return self.resume(pending)

    def discover(self):
        result = self.turn({"discover": True})
        if not isinstance(result.get("role"), str) or "available_actions" not in result:
            raise AssistantError("invalid_body", "Shop3i returned invalid discovery")
        return result

    def invoke(self, action, data=None, conversation=None):
        if not isinstance(action, str) or not action or not isinstance(data if data is not None else {}, dict):
            raise ValueError("Invalid action or data")
        body = {"action": action, "data": data or {}}
        if conversation:
            body.update(self._conversation_fields(conversation))
        return self.turn(body)

    def chat(self, message, conversation=None):
        if not isinstance(message, str) or not message or len(message) > 2000:
            raise ValueError("Invalid message")
        body = {"message": message}
        if conversation:
            body.update(self._conversation_fields(conversation))
        return self.turn(body)

    def confirm(self, conversation):
        return self.turn({**self._conversation_fields(conversation), "confirm": True})

    @staticmethod
    def _conversation_fields(conversation):
        if isinstance(conversation, dict):
            conversation = Conversation(conversation.get("conversation_id"), conversation.get("conversation_version"), conversation.get("status"))
        if not isinstance(conversation, Conversation) or not _uuid(conversation.id) or type(conversation.version) is not int or conversation.version < 0:
            raise ValueError("Invalid conversation receipt")
        return {"conversation_id": conversation.id, "conversation_version": conversation.version}


def from_environment(*, state_file=None):
    base = os.environ.get("SHOP3I_BASE_URL")
    shop = os.environ.get("SHOP3I_SHOP")
    if not base or not shop:
        raise ValueError("SHOP3I_BASE_URL and SHOP3I_SHOP are required")
    return AssistantClient(base, shop, token=os.environ.get("SHOP3I_BEARER_TOKEN"),
                           operation_token=os.environ.get("SHOP3I_OPERATION_TOKEN"), state_file=state_file)
