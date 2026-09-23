"""Bounded internal HTTP transport for FunctionGemma inference."""

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from engine import Engine

engine = None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, status, body):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        self.reply(
            200 if engine else 503,
            {"ready": engine is not None, "model": "google/functiongemma-270m-it"},
        )

    def do_POST(self):
        self.connection.settimeout(5)
        try:
            size = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(min(max(size, 0), 65537))
            if not 0 < size <= 65536:
                return self.reply(413, {"error": "Invalid body size"})
            if self.path != "/infer":
                return self.reply(404, {"error": "Unknown endpoint"})
            if engine is None:
                return self.reply(
                    503,
                    {"error": "Model unavailable; configure model access and restart"},
                )
            result = engine.infer(json.loads(raw))
            self.reply(200, result)
        except (ValueError, KeyError, TypeError):
            self.reply(422, {"error": "No valid single tool call; clarify the request"})
        except (RuntimeError, OSError, TimeoutError):
            self.reply(503, {"error": "Inference unavailable"})


if __name__ == "__main__":
    try:
        engine = Engine()
    except (RuntimeError, OSError, TimeoutError):
        print(
            "Model unavailable. Configure authorized Hugging Face access or a local model directory.",
            flush=True,
        )
    ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
