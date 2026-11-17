#!/usr/bin/env python3
"""Dev server for the Deck Lab.

Like `python3 -m http.server`, with two fixes:
- A bigger listen backlog. The stock server queues only 5 connections, so
  browsers loading many ES modules in parallel get connection resets and the
  app silently fails to boot.
- No caching, so edits show up on a normal reload.
- One file can be written back: the VFX/Animations board saves its effects with
  PUT /src/fx-presets.json. Nothing else is writable, the body has to be JSON,
  and only this machine may do it.

Usage: python3 serve.py [port]   (default 8000)
"""
import http.server
import json
import os
import sys

WRITABLE = "/src/fx-presets.json"
MAX_BODY = 512 * 1024


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_PUT(self):
        def reply(code, text):
            body = text.encode()
            self.send_response(code)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        if self.path.split("?")[0] != WRITABLE:
            return reply(403, "only the effects file can be saved")
        if self.client_address[0] not in ("127.0.0.1", "::1", "::ffff:127.0.0.1"):
            return reply(403, "saving is only allowed from this machine")
        length = int(self.headers.get("Content-Length") or 0)
        if not 0 < length <= MAX_BODY:
            return reply(413, "too big")
        try:
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, list):
                raise ValueError("expected a list of effects")
        except ValueError as err:
            return reply(400, f"not valid: {err}")
        with open(WRITABLE.lstrip("/"), "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        reply(200, "saved")


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    with Server(("", port), Handler) as httpd:
        print(f"Serving on http://localhost:{port}/  (Ctrl+C to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
