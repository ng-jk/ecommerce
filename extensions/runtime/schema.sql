CREATE TABLE IF NOT EXISTS plugin_operations (
 id uuid PRIMARY KEY, tenant text NOT NULL, installation text NOT NULL, caller text NOT NULL,
 idempotency_key text NOT NULL, payload_hash text NOT NULL, package_hash text NOT NULL,
 payload jsonb NOT NULL, status text NOT NULL DEFAULT 'queued', result jsonb,
 attempts integer NOT NULL DEFAULT 0, fence uuid, lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
 UNIQUE (tenant, installation, caller, idempotency_key),
 CHECK (status IN ('queued','processing','succeeded','rejected','failed'))
);
CREATE INDEX IF NOT EXISTS plugin_operations_claim ON plugin_operations(status, created_at) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS plugin_values (
 tenant text NOT NULL, installation text NOT NULL, key text NOT NULL, value jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
 PRIMARY KEY (tenant, installation, key)
);
CREATE TABLE IF NOT EXISTS plugin_rpc_receipts (
 operation_id uuid NOT NULL REFERENCES plugin_operations(id), sequence integer NOT NULL,
 request_hash text NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
 PRIMARY KEY(operation_id, sequence)
);
