#!/usr/bin/env python3
"""Clean-room release check — run this before every tag, on any OS.

Why this exists: on 2026-09-05 the whole local suite was green (pytest 227 +
vitest 177) while a fresh `pip install` produced a deck that could not start at
all. A dev box hides every packaging hole — the engine is already installed,
web/dist is already built, the keychain already works. Only an isolated install
from tracked files, into a fresh virtualenv, with an empty HOME, from a working
directory that is not the repo, tells the truth about what a user receives.

Usage:
    python scripts/clean_room_check.py            # clone HEAD, install, probe
    python scripts/clean_room_check.py --keep     # leave the sandbox for poking

Exit code 0 means: an outsider can install this commit and open the console.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

# The probe runs INSIDE the throwaway venv, against the installed copy, with a
# fake HOME and a cwd outside the repo. Keep it dependency-free.
PROBE = r'''
import json, os, sys, threading, time, urllib.error, urllib.request
PORT = int(sys.argv[1])
print("cwd (must not be the repo):", os.getcwd())

import toondeck
from pathlib import Path
root = Path(toondeck.__file__).parent
data = sorted(p.name for p in root.rglob("*.json"))
html = [str(p.relative_to(root)) for p in root.rglob("*.html")]
print("json shipped:", len(data), data[:4])
print("html shipped:", len(html), html[:3])

import mcptoon  # noqa: F401  — the engine must arrive as a real dependency
import httpx  # noqa: F401     — used by live model refresh / chat test
from toondeck.deck.api.app import create_app
import uvicorn

srv = uvicorn.Server(uvicorn.Config(create_app(), host="127.0.0.1", port=PORT, log_level="error"))
threading.Thread(target=srv.run, daemon=True).start()
for _ in range(160):
    if srv.started:
        break
    time.sleep(0.25)
else:
    print("FATAL: server never started"); raise SystemExit(1)

def call(p):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{p}", timeout=30) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

fails = []
def check(label, cond, extra=""):
    print(("  OK  " if cond else "  BAD ") + label + (f" {extra}" if extra else ""))
    if not cond:
        fails.append(label)

check("adapters + catalogs ship", {"signature.json", "providers.json"} <= set(data) and len(data) >= 10)
check("UI ships inside the package", (root / "deck" / "api" / "webui" / "index.html").is_file())

st, body = call("/")
check("GET / serves the SPA shell", st == 200 and b'<div id="root">' in body, f"-> {st}")
st, body = call("/agents")
check("deep link serves the shell", st == 200 and b'<div id="root">' in body, f"-> {st}")
st, body = call("/landing")
check("GET /landing serves the landing page", st == 200 and b"ToonDeck" in body, f"-> {st}")

st, body = call("/api/health")
h = json.loads(body or b"{}")
check("engine bridge is live", st == 200 and h.get("engine", {}).get("available") is True,
      f"engine={h.get('engine')}")

st, body = call("/api/agents")
d = json.loads(body or b"{}")
check("agent detection works from a clean HOME", st == 200 and len(d.get("agents", [])) >= 8,
      f"agents={len(d.get('agents', []))}")

for p in ("/api/skills/state", "/api/mcp/state", "/api/vault/state", "/api/agents/providers", "/api/fleet/overview"):
    st, body = call(p)
    try:
        json.loads(body); parsed = True
    except Exception:
        parsed = False
    check(f"{p} answers JSON", st == 200 and parsed, f"-> {st}")

st, body = call("/api/skills")
check("unknown /api path is an honest 404 JSON (not the shell)",
      st == 404 and b"not_found" in body, f"-> {st}")

print("RESULT:", "PASS" if not fails else f"FAIL {fails}")
raise SystemExit(0 if not fails else 1)
'''


def run(cmd, **kw):
    print(f"$ {' '.join(str(c) for c in cmd)}")
    return subprocess.run(cmd, text=True, **kw)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--keep", action="store_true", help="keep the sandbox afterwards")
    ap.add_argument("--port", type=int, default=8813, help="port for the probe server")
    args = ap.parse_args()

    if shutil.which("git") is None:
        print("git is required (the sandbox installs from a real clone)")
        return 2

    tmp = Path(tempfile.mkdtemp(prefix="toondeck-cleanroom-"))
    print(f"sandbox: {tmp}")
    try:
        # [1] clone tracked files only — an untracked web/dist or a stray .env
        #     must not be able to mask a packaging hole.
        clone = tmp / "clone"
        r = run(["git", "clone", "--quiet", str(REPO), str(clone)], capture_output=True)
        if r.returncode != 0:
            print(r.stderr)
            return 1

        # [2] a virtualenv with nothing in it but what the package asks for
        venv = tmp / "venv"
        r = run([sys.executable, "-m", "venv", str(venv)], capture_output=True)
        if r.returncode != 0:
            print(r.stderr)
            return 1
        py = str(venv / ("Scripts/python.exe" if os.name == "nt" else "bin/python"))
        r = run([py, "-m", "pip", "install", "--quiet", "--disable-pip-version-check", str(clone)])
        if r.returncode != 0:
            print("INSTALL FAILED — this is exactly what a user would hit")
            return 1

        # [3] cold start: empty HOME, empty TOONDECK_HOME, cwd outside the repo
        home = tmp / "fakehome"
        home.mkdir()
        work = tmp / "elsewhere"
        work.mkdir()
        probe = tmp / "probe.py"
        probe.write_text(PROBE, encoding="utf-8")
        env = dict(os.environ)
        env.update(
            {
                "HOME": str(home),
                "USERPROFILE": str(home),
                "TOONDECK_HOME": str(tmp / "deckhome"),
                "PYTHONUTF8": "1",
            }
        )
        env.pop("TOONDECK_WEB_DIST", None)
        print("\n=== installing and probing a deck that has never seen this repo ===")
        r = run([py, str(probe), str(args.port)], env=env, cwd=str(work))
        code = r.returncode

        if code == 0:
            print("\nA stranger can install this commit and open the console.")
        else:
            print("\nNOT RELEASE-READY — fix the lines above before tagging.")
        return code
    finally:
        if args.keep:
            print(f"sandbox kept at {tmp}")
        else:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
