"""`toondeck` CLI — one command: start the local console, open the browser."""

from __future__ import annotations

import argparse
import socket
import sys
import webbrowser

DEFAULT_PORT = 8720


def _ensure_port_free(host: str, port: int) -> None:
    """Fail fast with a friendly message when the port is occupied."""
    with socket.socket() as probe:
        try:
            probe.bind((host, port))
        except OSError:
            print(f"toondeck: port {port} is already in use on {host}.", file=sys.stderr)
            print("Try:  toondeck --port <other>", file=sys.stderr)
            raise SystemExit(1)


def _open_console(url: str, *, no_browser: bool) -> None:
    if not no_browser:
        webbrowser.open(url)


def build_server(*, port: int = DEFAULT_PORT, no_browser: bool = False) -> dict:
    """Compose the uvicorn target. Separated from main() so tests skip binding."""
    from .deck.api.app import create_app

    return {"app": create_app(), "host": "127.0.0.1", "port": port, "no_browser": no_browser}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="toondeck", description="One deck for every agent — the ToonDeck console."
    )
    parser.add_argument("--host", default="127.0.0.1", help="bind address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="port (default: 8720)")
    parser.add_argument("--no-browser", action="store_true", help="do not auto-open the browser")
    args = parser.parse_args(argv)

    _ensure_port_free(args.host, args.port)
    cfg = build_server(port=args.port, no_browser=args.no_browser)

    url = f"http://{args.host}:{args.port}"
    print(f"\n  🃏 ToonDeck console → {url}\n")
    _open_console(url, no_browser=args.no_browser)

    import uvicorn

    uvicorn.run(cfg["app"], host=cfg["host"], port=cfg["port"], log_level="info")
    return 0
