#!/usr/bin/env python3
"""Dev server for the Deck Lab.

Like `python3 -m http.server`, with two fixes:
- A bigger listen backlog. The stock server queues only 5 connections, so
  browsers loading many ES modules in parallel get connection resets and the
  app silently fails to boot.
- No caching, so edits show up on a normal reload.

Usage: python3 serve.py [port]   (default 8000)
"""
import http.server
import os
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


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
