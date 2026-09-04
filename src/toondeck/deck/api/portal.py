"""R53: portal auth — a password gate in front of the admin deck.

The deck runs on 127.0.0.1:8721 but any local process (or any website the
user browses via CSRF-to-localhost) can hit the API. The gate keeps
casual shoulders out; it is NOT a multi-user auth system.

Persistence: TOONDECK_HOME/portal.json — {"password_sha256": "<hex>",
"salt": "<hex>"} — sha256 of (password + salt), never the plaintext.
Precedence: env TOONDECK_PORTAL_PASSWORD overrides the stored hash (used
by power users / CI); with neither, the factory default is "admin123"
(first login seeds the file, `seeded` stays false until a custom password
is set). Forgot the password? Delete portal.json → back to admin123.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from pathlib import Path


def portal_file() -> Path:
    env = os.environ.get("TOONDECK_HOME")
    home = Path(env) if env else Path.home() / ".toondeck"
    return home / "portal.json"


DEFAULT_PASSWORD = "admin123"


def _hash(password: str, salt: str) -> str:
    return hashlib.sha256((password + salt).encode("utf-8")).hexdigest()


def _load() -> dict:
    f = portal_file()
    if f.is_file():
        try:
            import json

            return json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}
    return {}


def _save(data: dict) -> None:
    import json

    f = portal_file()
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(data, indent=2), encoding="utf-8")


def verify(password: str) -> bool:
    if not password:
        return False
    env_pw = os.environ.get("TOONDECK_PORTAL_PASSWORD")
    if env_pw:
        return hmac.compare_digest(password, env_pw)
    data = _load()
    if not data.get("password_sha256"):
        return hmac.compare_digest(password, DEFAULT_PASSWORD)
    return hmac.compare_digest(_hash(password, data.get("salt", "")), data["password_sha256"])


def set_password(password: str) -> dict:
    if not password or not password.strip():
        return {"ok": False, "error": "empty password"}
    password = password.strip()
    if len(password) < 6:
        return {"ok": False, "error": "password too short (min 6 chars)"}
    salt = secrets.token_hex(8)
    _save({"password_sha256": _hash(password, salt), "salt": salt})
    return {"ok": True, "seeded": True}


def state() -> dict:
    """Metadata only. `seeded` = a custom password is configured (or env
    override) — the UI offers a change-password affordance in that case."""
    env_pw = os.environ.get("TOONDECK_PORTAL_PASSWORD")
    if env_pw:
        return {"password_gate": True, "seeded": True}
    data = _load()
    return {"password_gate": True, "seeded": bool(data.get("password_sha256"))}


def ensure_sealed(password: str) -> None:
    """First successful login with the factory default seals it: the hash
    hits disk so `seeded` flips true and first-run hints disappear. No-op
    once sealed (custom hash) or under an env override."""
    if os.environ.get("TOONDECK_PORTAL_PASSWORD"):
        return
    if _load().get("password_sha256"):
        return
    set_password(password)
