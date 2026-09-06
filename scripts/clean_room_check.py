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

# ── ACTIONS, not just reads ───────────────────────────────────────────────
# CLEAN-ROOM AUDIT 2026-09-05 leg 2: every check above is a GET, which is how a
# broken POST survived a "RESULT: PASS". The vault probe is the one action the
# UI fires unconditionally, and on a machine with no usable keyring the raise
# escaped the handler: FastAPI answered 500 with the reason under `detail`, and
# the UI's `!r.ok && r.error` guard showed the user nothing at all.
#
# Two checks follow, because one is not enough. The first exercises the real
# HTTP failure path. The second breaks the keyring deliberately — necessary
# because fake HOME does NOT disable it on Windows (WinVault follows the
# logged-in user, not $HOME), so without that second step this gate passes on
# machines that would still crash a Linux user, and says so while lying.
def post(p, data=b"{}"):
    req = urllib.request.Request(
        f"http://127.0.0.1:{PORT}{p}", data=data, method="POST",
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

st, body = call("/api/vault/state")
vs = json.loads(body or b"{}")
provs = vs.get("providers") or []
pid = provs[0].get("id") if provs else ""
check("vault state lists a provider to act on", bool(pid), f"providers={len(provs)}")
if pid:
    st, body = post(f"/api/vault/test/{pid}")
    try:
        env = json.loads(body or b"{}")
        parsed = isinstance(env, dict)
    except Exception:
        env, parsed = {}, False
    check("POST vault probe answers JSON, never a 500",
          st != 500 and parsed and "ok" in env, f"-> {st} keys={sorted(env)[:4]}")
    if env.get("ok") is False:
        check("a failed probe names a reason (never silent)", bool(env.get("error")),
              f"error={env.get('error')!r}")
    check("probe never echoes a secret value", b"sk-" not in body and b"api_key" not in body)

    # ── now actually break the keyring ────────────────────────────────────
    # N1, honestly: the check above does NOT prove the bug. Fake HOME does not
    # disable the keyring on Windows — WinVault follows the logged-in user, not
    # $HOME — so a machine that passes it would still 500 on a Linux box with no
    # Secret Service, which is the class of machine the bug was filed against.
    # The server runs in THIS process, so the probe can take the one dependency
    # the bug was about and break it on purpose. That is the only way this gate
    # can prove N1 on any platform.
    import toondeck.deck.vault as _v

    def _no_keyring(provider):
        raise RuntimeError("No recommended backend was available. Install a keyring backend.")

    _orig = _v.store.get_secret
    _v.store.get_secret = _no_keyring
    try:
        st, body = post(f"/api/vault/test/{pid}")
        try:
            env = json.loads(body or b"{}")
            parsed = isinstance(env, dict)
        except Exception:
            env, parsed = {}, False
        check("probe survives a BROKEN keyring (N1: never a 500)",
              st != 500 and parsed and env.get("ok") is False
              and env.get("error") == "keyring_unavailable",
              f"-> {st} error={env.get('error')!r}")
        check("broken keyring gives a reason, not a stack trace",
              bool(env.get("detail")) and b"Traceback" not in body,
              f"detail={str(env.get('detail'))[:44]!r}")
        check("broken keyring still leaks no secret", b"sk-" not in body)

        # N5: the same hole, one layer down. The Agents page now sends
        # use_vault, so resolve_env() is reachable from an ordinary click — and
        # metadata outlives keyring health: a key stored on a healthy machine
        # leaves stored:true behind after the keyring dies, so the provider
        # still looks injectable right up until get_secret() throws. Refusing
        # the launch is the honest answer; starting an agent without the key it
        # was just promised is a slower, more confusing failure.
        _orig_meta = _v.meta.load_all
        _v.meta.load_all = lambda: {"providers": {pid: {"stored": True}}}
        try:
            st, body = post("/api/agents/cleanroom-probe/launch", b'{"use_vault": true}')
            try:
                env = json.loads(body or b"{}")
                parsed = isinstance(env, dict)
            except Exception:
                env, parsed = {}, False
            check("launch with vault injection survives a BROKEN keyring (N5: never a 500)",
                  st != 500 and parsed and env.get("ok") is False
                  and env.get("error") == "keyring_unavailable",
                  f"-> {st} error={env.get('error')!r}")
            check("refused launch leaks no secret", b"sk-" not in body)
        finally:
            _v.meta.load_all = _orig_meta
    finally:
        _v.store.get_secret = _orig

print("RESULT:", "PASS" if not fails else f"FAIL {fails}")
raise SystemExit(0 if not fails else 1)
'''


def run(cmd, **kw):
    print(f"$ {' '.join(str(c) for c in cmd)}")
    return subprocess.run(cmd, text=True, **kw)


def stranger_file_set() -> list[str]:
    """What a stranger receives once this work lands: everything tracked, plus
    new files that are not ignored. Ignored artifacts (a stale web/dist, a
    .venv, a stray .env) stay out — that exclusion is the sandbox's whole point.
    """
    out = subprocess.run(
        ["git", "-C", str(REPO), "ls-files", "--cached", "--others", "--exclude-standard"],
        capture_output=True,
        text=True,
    ).stdout.splitlines()
    return [rel for rel in out if (REPO / rel).is_file()]


def overlay_worktree(clone: Path) -> tuple[int, int]:
    """Write the working tree's content over the clone, keeping its .git.

    Without this the gate can only ever prove the last commit, which is no
    help while a fix is still under review — and a fix to a crash-on-probe bug
    is exactly the kind of thing that must be clean-room proven BEFORE it is
    committed, not after. The clone's history stays untouched, so the privacy
    check above still reads real commits.
    """
    files = stranger_file_set()
    keep = set(files)
    tracked_at_head = subprocess.run(
        ["git", "-C", str(clone), "ls-files"], capture_output=True, text=True
    ).stdout.splitlines()
    dropped = 0
    for rel in tracked_at_head:
        if rel not in keep and not (REPO / rel).exists():
            victim = clone / rel
            if victim.is_file():
                victim.unlink()
                dropped += 1
    for rel in files:
        dst = clone / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(REPO / rel, dst)
    return len(files), dropped


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--keep", action="store_true", help="keep the sandbox afterwards")
    ap.add_argument("--port", type=int, default=8813, help="port for the probe server")
    ap.add_argument(
        "--worktree",
        action="store_true",
        help="install and probe the WORKING TREE, not HEAD — proves a fix that "
        "is not committed yet. Ignored files still stay out, so the stranger's "
        "file set is unchanged in kind.",
    )
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

        # A clone is what a stranger receives, so it is also the privacy check:
        # internal planning notes must be absent from the tree AND from history
        # (untracking alone leaves them reachable via `git show <old-sha>:...`).
        for private in (".context", ".spec"):
            if (clone / private).exists():
                print(f"PRIVACY FAIL: a fresh clone contains {private}/")
                return 1
        hist = subprocess.run(
            ["git", "-C", str(clone), "log", "--all", "--name-only", "--pretty="],
            capture_output=True,
            text=True,
        ).stdout.splitlines()
        leaked = sorted({h.strip() for h in hist if h.strip().startswith((".context/", ".spec/"))})
        if leaked:
            print(f"PRIVACY FAIL: {len(leaked)} private doc path(s) still in history:")
            for p in leaked[:10]:
                print("   ", p)
            return 1
        print("privacy: fresh clone carries no internal planning docs (tree + history)\n")

        if args.worktree:
            n, dropped = overlay_worktree(clone)
            print(f"WORKTREE MODE: overlaid {n} file(s), dropped {dropped} — HEAD is NOT what is being proven\n")

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

        subject = "the WORKING TREE (not committed)" if args.worktree else "HEAD as a stranger gets it"
        if code == 0:
            print(f"\nOK — {subject}: installs, boots, and answers the probe.")
            if args.worktree:
                print("     commit it, then re-run WITHOUT --worktree to prove the real artifact.")
        else:
            print(f"\nNOT RELEASE-READY — {subject} failed above. Fix it before tagging.")
        return code
    finally:
        if args.keep:
            print(f"sandbox kept at {tmp}")
        else:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
