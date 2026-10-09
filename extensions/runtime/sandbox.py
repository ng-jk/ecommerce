"""Docker is the security boundary; there is deliberately no host-code fallback."""

import asyncio
import base64
import json
import re
import uuid
from pathlib import Path

from .contracts import canonical, object_fields, proposal, require

BOOTSTRAP = """import sys,json,base64,runpy
packet=json.loads(sys.stdin.readline())
with open('/tmp/plugin.zip','wb') as target:
    target.write(base64.b64decode(packet['archive']))
sys.argv=['plugin',json.dumps(packet['input'])]
runpy.run_path('/tmp/plugin.zip',run_name='__main__')
"""


class DockerSandbox:
    def __init__(self, image, executable="docker"):
        require(
            isinstance(image, str)
            and re.fullmatch(r"[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}", image),
            "digest_pinned_image_required",
        )
        self.image = image
        self.executable = executable

    def command(self, name):
        return [
            self.executable,
            "run",
            "--pull=never",
            "--name",
            name,
            "--network=none",
            "--read-only",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges:true",
            "--user=65534:65534",
            "--security-opt=seccomp=" + str(Path(__file__).with_name("seccomp.json")),
            "--memory=64m",
            "--memory-swap=64m",
            "--cpus=0.5",
            "--pids-limit=16",
            "--ulimit=nofile=64:64",
            "--ulimit=core=0",
            "--log-driver=none",
            "--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=4m,mode=1777",
            "-i",
            self.image,
            "python",
            "-I",
            "-S",
            "-u",
            "-c",
            BOOTSTRAP,
        ]

    async def execute(self, archive, payload, rpc):
        name = "shop3i-plugin-" + uuid.uuid4().hex
        process = None
        try:
            process = await asyncio.create_subprocess_exec(
                *self.command(name),
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
                limit=16384,
            )
            return await asyncio.wait_for(
                self.exchange(process, archive, payload, rpc), timeout=10
            )
        finally:
            # The daemon must confirm removal even if the CLI died or timed out.
            cleanup = await asyncio.create_subprocess_exec(
                self.executable,
                "rm",
                "-f",
                name,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            try:
                require(
                    await asyncio.wait_for(cleanup.wait(), timeout=5) == 0,
                    "sandbox_cleanup_failed",
                )
            except TimeoutError:
                cleanup.kill()
                await cleanup.wait()
                raise RuntimeError("sandbox_cleanup_failed") from None
            finally:
                if process is not None and process.returncode is None:
                    process.kill()
                    await process.wait()

    async def exchange(self, process, archive, payload, rpc):
        packet = {
            "archive": base64.b64encode(archive).decode(),
            "input": payload["input"],
        }
        process.stdin.write((canonical(packet) + "\n").encode())
        await process.stdin.drain()
        sequence = 0
        while True:
            line = await process.stdout.readline()
            require(0 < len(line) <= 16384, "invalid_sandbox_output")
            message = json.loads(line)
            if isinstance(message, dict) and set(message) == {"result"}:
                result = proposal(message["result"], payload["input"])
                process.stdin.close()
                require(await process.wait() == 0, "sandbox_failed")
                return result
            require(sequence < 32, "rpc_limit")
            object_fields(message, ("rpc",))
            # This closure supplies verified identity; message has no identity fields.
            result = await asyncio.to_thread(rpc, sequence, message["rpc"])
            process.stdin.write((canonical({"ok": result}) + "\n").encode())
            await process.stdin.drain()
            sequence += 1
