"""Server-local domain provisioning for the gated manual release pipeline.

Never copy test secrets here. This module has no SSH client and never deploys on
import. PUBLIC CONNECT changes preserve current non-service roles, not future
roles. Operators must apply the same isolation policy to newly created databases.
"""

import argparse
import base64
import json
import os
import re
import secrets
import subprocess
import time
from contextlib import ExitStack
from pathlib import Path

SERVICES = (
    "crm",
    "helpdesk",
    "learning",
    "builder",
    "insights",
    "erp",
    "hr",
    "lending",
)
EXCHANGE_MIGRATION = (
    "database/migrations/2026_10_13_015300_create_service_exchange_tables.php"
)
MIN_AVAILABLE_MIB = 2560


def run(
    command, *, input=None, env=None, stdin_path=None, stdout_path=None, timeout=600
):
    with ExitStack() as files:
        source = (
            files.enter_context(Path(stdin_path).open("rb")) if stdin_path else None
        )
        target = (
            files.enter_context(Path(stdout_path).open("xb"))
            if stdout_path
            else subprocess.PIPE
        )
        result = subprocess.run(
            command,
            input=input,
            stdin=source,
            stdout=target,
            stderr=subprocess.PIPE,
            check=False,
            env=env,
            timeout=timeout,
        )
    if result.returncode:
        # psql errors and Compose diagnostics can contain credentials. Keep them private.
        raise RuntimeError("Service release subprocess failed")
    return result.stdout or b""


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r"[a-z][a-z0-9_]{0,62}", value):
        raise ValueError("Invalid isolated database or role name")
    return value


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def read_environment(path):
    values = {}
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator or not re.fullmatch(r"[A-Z][A-Z0-9_]*", key):
            raise ValueError("Invalid server environment file")
        if key in values or "\x00" in value:
            raise ValueError("Duplicate or invalid environment value")
        if value[:1] in ('"', "'"):
            if len(value) < 2 or value[-1] != value[0]:
                raise ValueError("Invalid quoted environment value")
            value = value[1:-1]
        values[key] = value
    return values


def private_write(path, text):
    path = Path(path)
    if path.is_symlink():
        raise ValueError("Refusing a symbolic-link runtime file")
    temporary = path.with_name(path.name + ".pending")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as stream:
        stream.write(text)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(path)
    path.chmod(0o600)


def preflight(memory_text):
    match = re.search(r"^MemAvailable:\s+(\d+) kB$", memory_text, re.MULTILINE)
    if not match or int(match[1]) < MIN_AVAILABLE_MIB * 1024:
        raise RuntimeError(
            "Insufficient available memory for isolated services and reserve"
        )


def runtime(root, environment, project, core):
    root = Path(root)
    if (
        not root.is_absolute()
        or root.is_symlink()
        or ".." in root.parts
        or not re.fullmatch(r"[A-Za-z0-9:/_.-]+", root.as_posix())
    ):
        raise ValueError("Use a dedicated absolute server runtime directory")
    if environment not in ("production", "testing") or not re.fullmatch(
        r"[a-z][a-z0-9_-]{0,30}", project
    ):
        raise ValueError("Invalid service environment or project")
    database = identifier(core["DB_DATABASE"])
    username = identifier(core["DB_USERNAME"])
    prefix = project.replace("-", "_")
    root.mkdir(parents=True, exist_ok=True)
    root.chmod(0o700)
    state_file = root / "state.json"
    if state_file.exists():
        state = json.loads(state_file.read_text(encoding="utf-8"))
        if (
            state.get("environment"),
            state.get("project"),
            state.get("core_database"),
            state.get("core_role"),
        ) != (environment, project, database, username):
            raise ValueError(
                "Runtime belongs to a different environment; never reuse its secrets"
            )
    else:
        state = {
            "environment": environment,
            "project": project,
            "core_database": database,
            "core_role": username,
            "services": {
                service: {
                    "database": identifier(prefix + "_" + service),
                    "role": identifier(prefix + "_" + service),
                    "password": secrets.token_hex(32),
                    "signing_key": secrets.token_hex(32),
                    "app_key": "base64:"
                    + base64.b64encode(secrets.token_bytes(32)).decode("ascii"),
                }
                for service in SERVICES
            },
        }
        private_write(state_file, json.dumps(state))
    if set(state["services"]) != set(SERVICES):
        raise ValueError("Incomplete persisted service credentials; do not regenerate")
    for service, value in state["services"].items():
        expected = identifier(prefix + "_" + service)
        if (
            value["database"] != expected
            or value["role"] != expected
            or expected in (database, username)
        ):
            raise ValueError("Domain database or role collides with core")
        if any(
            not re.fullmatch(r"[a-f0-9]{64}", value[key])
            for key in ("password", "signing_key")
        ):
            raise ValueError("Invalid persisted service credentials")
        if not re.fullmatch(r"base64:[A-Za-z0-9+/]{43}=", value["app_key"]):
            raise ValueError("Invalid persisted service encryption key")
    return state


def write_environments(root, state, core, *, enabled=False):
    root = Path(root)
    platform = {"SERVICE_EXCHANGE_ENABLED": "true", "SERVICE_NAME": "platform"}
    for service, value in state["services"].items():
        upper = service.upper()
        platform.update(
            {
                f"PLATFORM_{upper}_SERVICE_KEY": value["signing_key"],
                f"{upper}_SERVICE_URL": f"https://{service}-internal/api/v1/internal/services",
                f"{upper}_SERVICE_AVAILABLE": str(enabled).lower(),
                f"{upper}_SERVICE_PROVISIONED": str(enabled).lower(),
            }
        )
        domain = {
            "APP_ENV": "production",
            "APP_DEBUG": "false",
            "APP_NAME": "Shop3i" + service.title(),
            "APP_KEY": value["app_key"],
            "LOG_CHANNEL": "stderr",
            "DB_CONNECTION": "pgsql",
            "DB_HOST": core.get("DB_HOST", "db"),
            "DB_PORT": core.get("DB_PORT", "5432"),
            "DB_SSLMODE": core.get("DB_SSLMODE", "prefer"),
            "DB_DATABASE": value["database"],
            "DB_USERNAME": value["role"],
            "DB_PASSWORD": value["password"],
            "SESSION_DRIVER": "array",
            "CACHE_STORE": "array",
            "SERVICE_EXCHANGE_ENABLED": "true",
            "SERVICE_NAME": service,
            f"PLATFORM_{upper}_SERVICE_KEY": value["signing_key"],
            "PLATFORM_SERVICE_URL": "https://platform-internal/api/v1/internal/services",
        }
        for entry in domain.values():
            if not re.fullmatch(r"[A-Za-z0-9_:/+.=-]+", entry):
                raise ValueError("Unsupported runtime environment value")
        private_write(
            root / f"{service}.env",
            "".join(f"{key}={value}\n" for key, value in domain.items()),
        )
    private_write(
        root / "platform.env",
        "".join(f"{key}={value}\n" for key, value in platform.items()),
    )
    compose_values = {
        "SERVICE_RUNTIME_DIR": root.as_posix(),
        "SERVICE_RUNTIME_UID": str(getattr(os, "getuid", lambda: 0)()),
        "SERVICE_RUNTIME_GID": str(getattr(os, "getgid", lambda: 0)()),
    }
    for key, pattern in {
        "RELEASE_ID": r"[a-f0-9]{40}",
        "APP_IMAGE_PREFIX": r"[a-z][a-z0-9_-]{0,47}",
    }.items():
        if key in core:
            if not re.fullmatch(pattern, core[key]):
                raise ValueError("Invalid service release image identity")
            compose_values[key] = core[key]
    private_write(
        root / "compose.env",
        "".join(f"{key}={value}\n" for key, value in compose_values.items()),
    )
    private_write(
        root / "pool.conf",
        "[www]\npm = ondemand\npm.max_children = 1\npm.process_idle_timeout = 10s\npm.max_requests = 250\nlisten.backlog = 128\n",
    )
    (root / "pool.conf").chmod(0o644)


def certificates(root, runner=run):
    directory = Path(root) / "certificates"
    directory.mkdir(exist_ok=True)
    ca, key, leaf, leafkey = (
        directory / name
        for name in ("ca.crt", "ca.key", "services.crt", "services.key")
    )
    for pair in ((ca, key), (leaf, leafkey)):
        if any(path.exists() for path in pair) and not all(
            path.exists() for path in pair
        ):
            raise RuntimeError(
                "Partial certificate state; retain and recover existing trust"
            )
    if leaf.exists() and not ca.exists():
        raise RuntimeError(
            "Existing leaf certificate has no trusted CA; do not replace trust"
        )
    if not ca.exists():
        runner(
            [
                "openssl",
                "req",
                "-x509",
                "-newkey",
                "rsa:3072",
                "-nodes",
                "-days",
                "3650",
                "-subj",
                "/CN=Shop3i private service CA",
                "-keyout",
                str(key),
                "-out",
                str(ca),
            ]
        )
    if not leaf.exists():
        extension = directory / "services.ext"
        private_write(
            extension,
            "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\n"
            "extendedKeyUsage=serverAuth\nsubjectAltName="
            + ",".join("DNS:" + name + "-internal" for name in ("platform", *SERVICES))
            + "\n",
        )
        csr = directory / "services.csr"
        runner(
            [
                "openssl",
                "req",
                "-new",
                "-newkey",
                "rsa:3072",
                "-nodes",
                "-subj",
                "/CN=platform-internal",
                "-keyout",
                str(leafkey),
                "-out",
                str(csr),
            ]
        )
        runner(
            [
                "openssl",
                "x509",
                "-req",
                "-in",
                str(csr),
                "-CA",
                str(ca),
                "-CAkey",
                str(key),
                "-CAcreateserial",
                "-days",
                "365",
                "-extfile",
                str(extension),
                "-out",
                str(leaf),
            ]
        )
    for path in (ca, leaf):
        runner(["openssl", "x509", "-in", str(path), "-checkend", "604800", "-noout"])
    for name in ("platform", *SERVICES):
        runner(
            [
                "openssl",
                "verify",
                "-CAfile",
                str(ca),
                "-verify_hostname",
                name + "-internal",
                str(leaf),
            ]
        )
    for path in (ca, key, leaf, leafkey):
        if (
            path.suffix == ".key"
            and path.stat().st_uid != getattr(os, "getuid", lambda: 0)()
        ):
            raise RuntimeError(
                "Private service key belongs to a different runtime identity"
            )
        path.chmod(0o600 if path.suffix == ".key" else 0o644)


def database_snapshot_sql():
    return """SELECT json_build_object('databases', (SELECT json_agg(json_build_object(
        'name', datname, 'owner', pg_get_userbyid(datdba), 'acl', datacl::text,
        'allow_connections', datallowconn)) FROM pg_database),
        'service_roles', (SELECT json_agg(rolname) FROM pg_roles WHERE shobj_description(oid,'pg_authid') LIKE 'shop3i-service:%'),
        'connections', (SELECT json_agg(json_build_object('role', r.rolname, 'database', d.datname))
        FROM pg_roles r CROSS JOIN pg_database d
        WHERE d.datallowconn AND has_database_privilege(r.oid,d.oid,'CONNECT')))::text;"""


def provisioning_sql(state, snapshot):
    """Capture/retain existing authority before replacing PUBLIC with explicit grants."""
    roles = [value["role"] for value in state["services"].values()]
    databases = [value["database"] for value in state["services"].values()]
    lines = ["\\set ON_ERROR_STOP on"]
    for service, value in state["services"].items():
        role, database = identifier(value["role"]), identifier(value["database"])
        marker = "shop3i-service:" + state["project"] + ":" + service
        lines.append(f"""DO $guard$ BEGIN
IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname={literal(role)}) THEN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname={literal(role)} AND
 (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR NOT rolcanlogin))
 OR EXISTS (SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname={literal(role)}))
 OR EXISTS (SELECT 1 FROM pg_database WHERE datdba=(SELECT oid FROM pg_roles WHERE rolname={literal(role)}) AND datname<>{literal(database)})
 OR COALESCE(shobj_description((SELECT oid FROM pg_roles WHERE rolname={literal(role)}),'pg_authid'),'') <> {literal(marker)} THEN
 RAISE EXCEPTION 'Existing domain role is not an isolated provisioned identity'; END IF;
ELSE
 CREATE ROLE {role} LOGIN PASSWORD {literal(value["password"])} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 COMMENT ON ROLE {role} IS {literal(marker)};
END IF;
IF EXISTS (SELECT 1 FROM pg_database WHERE datname={literal(database)} AND pg_get_userbyid(datdba)<>{literal(role)}) THEN
 RAISE EXCEPTION 'Existing domain database has unexpected ownership'; END IF;
END $guard$;""")
        lines.append(
            f"SELECT 'CREATE DATABASE {database} OWNER {role}' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname={literal(database)}) \\gexec"
        )
        lines.append(f"REVOKE ALL ON DATABASE {database} FROM PUBLIC;")
        lines.append(f"GRANT CONNECT ON DATABASE {database} TO {role};")
    # Existing Supabase/core principals keep their effective pre-provision access.
    lines.append("BEGIN;")
    managed_roles = set(roles) | set(snapshot.get("service_roles") or [])
    for pair in snapshot["connections"] or []:
        if pair["role"] not in managed_roles and pair["database"] not in databases:
            role = '"' + pair["role"].replace('"', '""') + '"'
            database = '"' + pair["database"].replace('"', '""') + '"'
            lines.append(f"GRANT CONNECT ON DATABASE {database} TO {role};")
    all_databases = {entry["name"] for entry in snapshot["databases"]} | set(databases)
    for name in sorted(all_databases):
        database = '"' + name.replace('"', '""') + '"'
        lines.append(f"REVOKE CONNECT ON DATABASE {database} FROM PUBLIC;")
        for value in state["services"].values():
            if value["database"] != name:
                lines.append(
                    f"REVOKE ALL ON DATABASE {database} FROM {identifier(value['role'])};"
                )
        if name in databases:
            lines.append(
                f"REVOKE ALL ON DATABASE {database} FROM {identifier(state['core_role'])};"
            )
    lines.append("COMMIT;")
    return "\n".join(lines) + "\n"


def psql(docker, container, query, runner=run):
    return (
        runner(
            [
                *docker,
                "exec",
                "-i",
                container,
                "psql",
                "-X",
                "-q",
                "-A",
                "-t",
                "-v",
                "ON_ERROR_STOP=1",
                "-U",
                "supabase_admin",
                "-d",
                "postgres",
            ],
            input=query.encode("utf-8"),
        )
        .decode()
        .strip()
    )


def provision(root, state, docker, container, runner=run):
    snapshot = json.loads(psql(docker, container, database_snapshot_sql(), runner))
    audit = Path(root) / ("acl-before-" + str(time.time_ns()) + ".json")
    private_write(audit, json.dumps(snapshot))
    psql(docker, container, provisioning_sql(state, snapshot), runner)
    roles = [value["role"] for value in state["services"].values()]
    for value in state["services"].values():
        # Verify effective rights, including inherited memberships and PUBLIC ACLs.
        query = f"SELECT count(*) FROM pg_database WHERE datname<>{literal(value['database'])} AND has_database_privilege({literal(value['role'])},oid,'CONNECT');"
        if psql(docker, container, query, runner) != "0":
            raise RuntimeError("Foreign database CONNECT remains possible")
        output = runner(
            [
                *docker,
                "exec",
                "-i",
                container,
                "sh",
                "-c",
                'IFS= read -r PGPASSWORD; export PGPASSWORD; exec "$@"',
                "verify",
                "psql",
                "-w",
                "-X",
                "-q",
                "-A",
                "-t",
                "-v",
                "ON_ERROR_STOP=1",
                "-h",
                "127.0.0.1",
                "-U",
                value["role"],
                "-d",
                value["database"],
                "-c",
                "SELECT current_user",
            ],
            input=(value["password"] + "\n").encode(),
        )
        if output.decode().strip() != value["role"]:
            raise RuntimeError(
                "Domain database credentials do not match persistent role"
            )
    domain_names = ",".join(
        literal(value["database"]) for value in state["services"].values()
    )
    if (
        psql(
            docker,
            container,
            f"SELECT count(*) FROM pg_database WHERE datname IN ({domain_names}) AND has_database_privilege({literal(state['core_role'])},oid,'CONNECT');",
            runner,
        )
        != "0"
    ):
        raise RuntimeError("Core role can connect to a domain database")
    for pair in snapshot["connections"] or []:
        if pair["role"] not in roles and pair["database"] not in {
            value["database"] for value in state["services"].values()
        }:
            query = f"SELECT has_database_privilege({literal(pair['role'])},{literal(pair['database'])},'CONNECT')::int;"
            if psql(docker, container, query, runner) != "1":
                raise RuntimeError("Existing principal lost database access")


def credential_query(docker, container, value, database, query, runner=run):
    return (
        runner(
            [
                *docker,
                "exec",
                "-i",
                container,
                "sh",
                "-c",
                'IFS= read -r PGPASSWORD; export PGPASSWORD; exec "$@"',
                "verify",
                "psql",
                "-w",
                "-X",
                "-q",
                "-A",
                "-t",
                "-v",
                "ON_ERROR_STOP=1",
                "-h",
                "127.0.0.1",
                "-U",
                value["role"],
                "-d",
                database,
                "-c",
                query,
            ],
            input=(value["password"] + "\n").encode(),
        )
        .decode()
        .strip()
    )


def isolation_probe(state, docker, container, runner=run):
    shared = {
        "public.migrations",
        "public.service_inboxes",
        "public.service_deliveries",
        "public.service_request_nonces",
    }
    databases = {
        state["core_database"],
        "postgres",
        *(value["database"] for value in state["services"].values()),
    }
    for service, value in state["services"].items():
        tables = set(
            credential_query(
                docker,
                container,
                value,
                value["database"],
                "SELECT table_schema || '.' || table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')",
                runner,
            ).splitlines()
        )
        prefix = "public." + ("insight" if service == "insights" else service) + "_"
        if (
            not shared <= tables
            or not tables - shared
            or any(not table.startswith(prefix) for table in tables - shared)
        ):
            raise RuntimeError(
                "Domain database contains foreign tables or lacks its migrated schema"
            )
        for database in sorted(databases - {value["database"]}):
            try:
                credential_query(
                    docker, container, value, database, "SELECT current_user", runner
                )
            except RuntimeError:
                continue
            raise RuntimeError("Domain credentials connected to a foreign database")
        if (
            credential_query(
                docker,
                container,
                value,
                value["database"],
                "SELECT current_user",
                runner,
            )
            != value["role"]
        ):
            raise RuntimeError(
                "Domain database stopped responding during isolation verification"
            )


def compose_command(docker, env_file, root, project):
    return [
        *docker,
        "compose",
        "--project-name",
        project,
        "--env-file",
        str(env_file),
        "--env-file",
        str(Path(root) / "compose.env"),
        "-f",
        "compose.server.yaml",
        "-f",
        "compose.server.services.yaml",
    ]


def backup_domains(root, state, docker, container, release, runner=run):
    if not re.fullmatch(r"[a-f0-9]{40}", release):
        raise ValueError("Backups require the verified release commit")
    directory = Path(root) / "backups"
    directory.mkdir(exist_ok=True)
    for service, value in state["services"].items():
        path = directory / (
            release + "-" + service + "-" + str(time.time_ns()) + ".dump"
        )
        runner(
            [
                *docker,
                "exec",
                container,
                "pg_dump",
                "-U",
                "supabase_admin",
                "-d",
                value["database"],
                "-Fc",
            ],
            stdout_path=path,
        )
        if not path.is_file() or not path.stat().st_size:
            raise RuntimeError("Domain database backup is empty")
        path.chmod(0o600)
        runner(
            [*docker, "exec", "-i", container, "pg_restore", "--list"], stdin_path=path
        )


def probe(compose, runner=run):
    # Container state is a useful early failure, but durable worker completion is authoritative.
    output = runner([*compose, "ps", "--format", "json"]).decode().strip()
    running = (
        json.loads(output)
        if output.startswith("[")
        else [json.loads(line) for line in output.splitlines()]
    )
    required = {
        "service-worker",
        "service-gateway",
        *SERVICES,
        *(service + "-worker" for service in SERVICES),
    }
    healthy = {
        entry["Service"]
        for entry in running
        if entry.get("State") == "running"
        and entry.get("Health", "") in ("", "healthy")
    }
    if not required <= healthy:
        raise RuntimeError("A domain API, worker or service relay is not running")

    # A signed request is committed to each domain inbox; the domain worker
    # commits a matching outbox reply, and the platform worker consumes it.
    # Both the reply and nonce are checked from the platform's durable inbox.
    script = """require 'vendor/autoload.php'; $app=require 'bootstrap/app.php';
$app->make(Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap();
$services=SERVICE_NAMES;
if (array_values(config('platform.service_names')) !== $services) { throw new RuntimeException('Unexpected service topology'); }
$pending=[];
foreach ($services as $service) {
 $peer=config('service_exchange.peers.'.$service);
 $transport=new App\\Modules\\Platform\\Services\\ServiceTransport($peer['url'],$peer['key'],'platform',$service);
 $id=(string) Illuminate\\Support\\Str::uuid(); $nonce=(string) Illuminate\\Support\\Str::uuid();
 $message=['id'=>$id,'source'=>'platform','destination'=>$service,'topic'=>'transport.health',
  'version'=>1,'payload'=>['nonce'=>$nonce]];
 $encoded=json_encode($message,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES,32);
 $transport->deliver($message,hash('sha256',$encoded));
 $pending[$service]=[$id,$nonce];
}
$deadline=microtime(true)+45;
do {
 foreach ($pending as $service=>[$id,$nonce]) {
  $row=Illuminate\\Support\\Facades\\DB::table('service_inboxes')->where('source',$service)
   ->where('destination','platform')->where('message_id',$id)->first();
  if (!$row) { continue; }
  if ($row->status==='failed') { throw new RuntimeException('Health response failed: '.$service); }
  if ($row->status!=='succeeded') { continue; }
  $reply=json_decode($row->envelope,true,32,JSON_THROW_ON_ERROR);
  if ($reply !== ['id'=>$id,'source'=>$service,'destination'=>'platform','topic'=>'transport.health',
    'version'=>1,'payload'=>['nonce'=>$nonce]]) { throw new RuntimeException('Health response mismatch: '.$service); }
  unset($pending[$service]);
 }
 if (!$pending) { exit(0); }
 usleep(250000);
} while (microtime(true)<$deadline);
throw new RuntimeException('Workers did not complete durable health roundtrip: '.implode(',',array_keys($pending)));"""
    script = script.replace(
        "SERVICE_NAMES", "json_decode('" + json.dumps(list(SERVICES)) + "',true)"
    )
    runner(
        [*compose, "run", "--rm", "--no-deps", "-T", "backend", "php", "-r", script],
        timeout=180,
    )


def deploy(root, state, core, compose, docker, container, release, runner=run):
    private_write(
        Path(root) / "ready.json", json.dumps({"release": release, "ready": False})
    )
    write_environments(root, state, core, enabled=False)
    provision(root, state, docker, container, runner)
    backup_domains(root, state, docker, container, release, runner)
    workers = ["service-worker", *(service + "-worker" for service in SERVICES)]
    runner([*compose, "stop", "-t", "40", *workers])
    for service in SERVICES:
        for path in (EXCHANGE_MIGRATION, "database/migrations/services/" + service):
            runner(
                [
                    *compose,
                    "run",
                    "--rm",
                    "--no-deps",
                    "-T",
                    service,
                    "php",
                    "artisan",
                    "migrate",
                    "--force",
                    "--path=" + path,
                ]
            )
    isolation_probe(state, docker, container, runner)
    runner(
        [
            *compose,
            "up",
            "-d",
            "--no-build",
            "--wait",
            "--force-recreate",
            "backend",
            *SERVICES,
            *workers,
            "service-gateway",
        ]
    )
    probe(compose, runner)
    # Only successful migration + isolation + HTTPS/worker checks activate discovery.
    write_environments(root, state, core, enabled=True)
    runner(
        [
            *compose,
            "up",
            "-d",
            "--no-build",
            "--wait",
            "--force-recreate",
            "backend",
            "worker",
            "service-worker",
        ]
    )
    private_write(
        Path(root) / "ready.json",
        json.dumps({"release": release, "services": list(SERVICES), "ready": True}),
    )


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["prepare", "deploy"])
    parser.add_argument(
        "--environment", choices=["production", "testing"], required=True
    )
    parser.add_argument("--project", required=True)
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--runtime", type=Path, required=True)
    parser.add_argument("--database-container", default="supabase-db")
    parser.add_argument("--sudo-docker", action="store_true")
    parser.add_argument("--release")
    args = parser.parse_args(argv)
    if args.action == "deploy" and (
        not args.release or not re.fullmatch(r"[a-f0-9]{40}", args.release)
    ):
        raise ValueError("Deploy requires a verified release commit")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", args.database_container):
        raise ValueError("Invalid database container")
    if args.runtime.resolve().is_relative_to(Path.cwd().resolve()):
        raise ValueError("Service secrets must stay outside the release checkout")
    preflight(Path("/proc/meminfo").read_text())
    core = read_environment(args.env_file)
    if args.release:
        core["RELEASE_ID"] = args.release
    core["APP_IMAGE_PREFIX"] = os.environ.get("APP_IMAGE_PREFIX", "shop3i")
    state = runtime(args.runtime, args.environment, args.project, core)
    docker = ["sudo", "-n", "docker"] if args.sudo_docker else ["docker"]
    certificates(args.runtime)
    write_environments(args.runtime, state, core)
    if args.action == "deploy":
        compose = compose_command(docker, args.env_file, args.runtime, args.project)
        deploy(
            args.runtime,
            state,
            core,
            compose,
            docker,
            args.database_container,
            args.release,
        )


if __name__ == "__main__":
    main()
