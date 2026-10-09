"""Trusted plugin-owned PostgreSQL persistence. Never imported inside a sandbox."""

import uuid
from pathlib import Path

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .contracts import canonical, digest, identifier, object_fields, require


class Storage:
    def __init__(self, dsn):
        self.dsn = dsn

    def connect(self):
        return psycopg.connect(
            self.dsn,
            row_factory=dict_row,
            connect_timeout=5,
            options="-c statement_timeout=3000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=5000",
        )

    def migrate(self):
        with self.connect() as db:
            db.execute(Path(__file__).with_name("schema.sql").read_text())

    def accept(self, binding, key, payload):
        identifier(key)
        fingerprint = digest(canonical(payload).encode())
        with self.connect() as db:
            # Serialize acceptance/quota per installation, including absent rows.
            db.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
                (binding.tenant + ":" + binding.installation,),
            )
            old = db.execute(
                "SELECT id, payload_hash FROM plugin_operations WHERE tenant=%s AND installation=%s AND caller=%s AND idempotency_key=%s",
                (binding.tenant, binding.installation, binding.caller, key),
            ).fetchone()
            if old:
                require(old["payload_hash"] == fingerprint, "idempotency_conflict")
                return str(old["id"])
            count = db.execute(
                "SELECT count(*) AS n FROM plugin_operations WHERE tenant=%s AND installation=%s AND status IN ('queued','processing')",
                (binding.tenant, binding.installation),
            ).fetchone()["n"]
            require(count < 20, "queue_full")
            operation = str(uuid.uuid4())
            db.execute(
                "INSERT INTO plugin_operations(id,tenant,installation,caller,idempotency_key,payload_hash,package_hash,payload) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                (
                    operation,
                    binding.tenant,
                    binding.installation,
                    binding.caller,
                    key,
                    fingerprint,
                    binding.sha256,
                    Jsonb(payload),
                ),
            )
            db.execute("SELECT pg_notify('plugin_work', '')")
        return operation

    def poll(self, binding, operation):
        with self.connect() as db:
            row = db.execute(
                "SELECT id,status,result FROM plugin_operations WHERE id=%s AND tenant=%s AND installation=%s AND caller=%s AND deleted_at IS NULL",
                (operation, binding.tenant, binding.installation, binding.caller),
            ).fetchone()
        require(row is not None, "operation_missing")
        return {"id": str(row["id"]), "status": row["status"], "result": row["result"]}

    def claim(self):
        with self.connect() as db:
            db.execute(
                "UPDATE plugin_operations SET status='failed',result=' {\"error\":\"attempts_exhausted\"}'::jsonb,updated_at=now() WHERE status='processing' AND lease_until<now() AND attempts>=3"
            )
            row = db.execute(
                "SELECT * FROM plugin_operations WHERE deleted_at IS NULL AND attempts<3 AND (status='queued' OR (status='processing' AND lease_until<now())) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1"
            ).fetchone()
            if row is None:
                return None
            fence = str(uuid.uuid4())
            db.execute(
                "UPDATE plugin_operations SET status='processing',attempts=attempts+1,fence=%s,lease_until=now()+interval '30 seconds',updated_at=now() WHERE id=%s",
                (fence, row["id"]),
            )
            return {**row, "fence": fence}

    def complete(self, job, status, result):
        with self.connect() as db:
            changed = db.execute(
                "UPDATE plugin_operations SET status=%s,result=%s,updated_at=now() WHERE id=%s AND fence=%s AND status='processing' AND lease_until>now()",
                (status, Jsonb(result), job["id"], job["fence"]),
            ).rowcount
            require(changed == 1, "stale_lease")

    def rpc(self, binding, job, sequence, request):
        object_fields(request, ("method", "params"))
        method = request["method"]
        require(method in ("storage.get", "storage.set"), "unsupported_capability")
        require(
            ("storage.read" if method == "storage.get" else "storage.write")
            in binding.capabilities,
            "forbidden",
        )
        params = request["params"]
        object_fields(params, ("key",) if method == "storage.get" else ("key", "value"))
        key = identifier(params["key"])
        encoded = canonical(request)
        require(len(encoded.encode()) <= 8192, "value_too_large")
        fingerprint = digest(encoded.encode())
        with self.connect() as db:
            live = db.execute(
                "SELECT id FROM plugin_operations WHERE id=%s AND tenant=%s AND installation=%s AND fence=%s AND status='processing' AND lease_until>now() FOR UPDATE",
                (job["id"], binding.tenant, binding.installation, job["fence"]),
            ).fetchone()
            require(live is not None, "stale_lease")
            receipt = db.execute(
                "SELECT request_hash,result FROM plugin_rpc_receipts WHERE operation_id=%s AND sequence=%s",
                (job["id"], sequence),
            ).fetchone()
            if receipt:
                require(receipt["request_hash"] == fingerprint, "replay_mismatch")
                return receipt["result"]
            db.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
                (binding.tenant + ":" + binding.installation,),
            )
            if method == "storage.set":
                count = db.execute(
                    "SELECT count(*) AS n FROM plugin_values WHERE tenant=%s AND installation=%s AND deleted_at IS NULL",
                    (binding.tenant, binding.installation),
                ).fetchone()["n"]
                exists = db.execute(
                    "SELECT key FROM plugin_values WHERE tenant=%s AND installation=%s AND key=%s",
                    (binding.tenant, binding.installation, key),
                ).fetchone()
                require(count < 1000 or exists is not None, "storage_full")
                db.execute(
                    "INSERT INTO plugin_values(tenant,installation,key,value) VALUES (%s,%s,%s,%s) ON CONFLICT(tenant,installation,key) DO UPDATE SET value=EXCLUDED.value,updated_at=now(),deleted_at=NULL",
                    (binding.tenant, binding.installation, key, Jsonb(params["value"])),
                )
                result = {"saved": True}
            else:
                row = db.execute(
                    "SELECT value FROM plugin_values WHERE tenant=%s AND installation=%s AND key=%s AND deleted_at IS NULL",
                    (binding.tenant, binding.installation, key),
                ).fetchone()
                result = {"value": None if row is None else row["value"]}
            db.execute(
                "INSERT INTO plugin_rpc_receipts(operation_id,sequence,request_hash,result) VALUES (%s,%s,%s,%s)",
                (job["id"], sequence, fingerprint, Jsonb(result)),
            )
            return result

    def wait(self):
        # Subscribe first, then rescan: missed notifications never lose work.
        with self.connect() as db:
            db.autocommit = True
            db.execute("LISTEN plugin_work")
            pending = db.execute(
                "SELECT 1 FROM plugin_operations WHERE status='queued' LIMIT 1"
            ).fetchone()
            if pending is None:
                list(db.notifies(timeout=2, stop_after=1))
