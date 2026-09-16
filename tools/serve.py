#!/usr/bin/env python3
"""Serve the ready-built ROM-free playground. Python 3, no packages needed."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".wasm": "application/wasm", ".js": "text/javascript"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--bind", default="127.0.0.1")
    args = parser.parse_args()
    print(f"Smooth64 → http://{args.bind}:{args.port} (Ctrl+C to stop)", flush=True)
    server = ThreadingHTTPServer((args.bind, args.port), partial(Handler, directory=str(ROOT / "web")))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
