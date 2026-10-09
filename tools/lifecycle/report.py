"""Durable, sanitized status evidence for each release invocation."""

import json
import os
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

STATUSES = {"passed", "failed", "blocked", "skipped", "running"}


def stamp() -> str:
    return datetime.now(timezone.utc).isoformat()


class Report:
    def __init__(
        self, root: Path, run_id: str, commit: str, profile: str, spec_digest: str
    ):
        self.directory = root / "test-results" / "lifecycle"
        self.directory.mkdir(parents=True, exist_ok=True)
        self.path = self.directory / f"{run_id}.json"
        self.text_path = self.directory / f"{run_id}.txt"
        self.data = {
            "run_id": run_id,
            "commit": commit,
            "profile": profile,
            "spec_digest": spec_digest,
            "started_at": stamp(),
            "finished_at": None,
            "status": "running",
            "stages": [],
            "artifacts": {},
        }
        self.save()

    def stage(self, name: str, status: str, detail: str = "") -> None:
        if status not in STATUSES:
            raise ValueError("Invalid stage status")
        self.data["stages"].append(
            {"name": name, "status": status, "at": stamp(), "detail": detail}
        )
        self.save()

    def artifact(self, name: str, digest: str) -> None:
        self.data["artifacts"][name] = digest
        self.save()

    def finish(self, status: str) -> None:
        if status not in STATUSES:
            raise ValueError("Invalid lifecycle status")
        self.data["status"] = status
        self.data["finished_at"] = stamp()
        self.save()

    def save(self) -> None:
        payload = json.dumps(self.data, indent=2, sort_keys=True)
        fd, temporary = tempfile.mkstemp(prefix=".report-", dir=self.directory)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                stream.write(payload)
                stream.flush()
                os.fsync(stream.fileno())
            attempt = 0
            while True:
                try:
                    os.replace(temporary, self.path)
                    break
                except PermissionError:
                    attempt += 1
                    if attempt == 5:
                        raise
                    time.sleep(0.1)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
        lines = [
            f"Run {self.data['run_id']}: {self.data['status']}",
            f"Commit: {self.data['commit']}",
            f"Profile: {self.data['profile']}",
            f"Spec SHA256: {self.data['spec_digest']}",
        ]
        lines.extend(
            f"{item['name']}: {item['status']} {item['detail']}"
            for item in self.data["stages"]
        )
        self.text_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
