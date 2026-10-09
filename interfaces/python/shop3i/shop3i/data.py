"""HTTP and private receipt storage. Neither layer knows assistant actions."""

import json
import os
import stat
import urllib.error
import urllib.request
from pathlib import Path


class TransportFailure(Exception):
    pass


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _is_posix():
    return os.name != "nt"


def _inside_git(target):
    return any((parent / ".git").exists() for parent in (target.parent, *target.parents))


def request(method, url, headers, payload=None, timeout=10):
    body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode()
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(req, timeout=timeout) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers), exc.read()
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise TransportFailure("Shop3i connection failed") from exc


def load_receipt(path):
    target = Path(path)
    if not target.exists():
        return None
    if _inside_git(target):
        raise ValueError("Receipt state must be outside a Git checkout")
    if target.is_symlink() or not target.is_file():
        raise ValueError("Receipt state must be a regular file")
    if _is_posix() and stat.S_IMODE(target.stat().st_mode) & 0o077:
        raise ValueError("Receipt state must be private (mode 0600)")
    data = json.loads(target.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or set(data) != {"origin", "shop", "receipt"}:
        raise ValueError("Invalid receipt state")
    return data


def save_receipt(path, data):
    target = Path(path)
    if target.exists() or target.is_symlink():
        raise ValueError("Receipt state already exists")
    if _inside_git(target):
        raise ValueError("Receipt state must be outside a Git checkout")
    target.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(data, stream)
    except BaseException:
        target.unlink(missing_ok=True)
        raise
