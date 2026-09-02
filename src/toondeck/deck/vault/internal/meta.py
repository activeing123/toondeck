"""vault.json — metadata ledger. The secret itself lives ONLY in the OS keychain."""

from __future__ import annotations

import json
import os
import time

from . import vault_file


def _load() -> dict:
    vf = vault_file()
    if vf.is_file():
        try:
            return json.loads(vf.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save(data: dict) -> None:
    vf = vault_file()
    vf.parent.mkdir(parents=True, exist_ok=True)
    tmp = vf.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(str(tmp), str(vf))


def load_all() -> dict:
    return _load()


def record_stored(provider: str) -> None:
    data = _load()
    entry = data.setdefault("providers", {}).setdefault(provider, {})
    entry["stored"] = True
    entry["set_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    entry.pop("removed_at", None)
    _save(data)


def record_test(provider: str, *, ok: bool, status: str, detail: str | None = None) -> None:
    data = _load()
    entry = data.setdefault("providers", {}).setdefault(provider, {})
    entry["last_test"] = {
        "ok": ok,
        "status": status,
        "detail": detail,
        "at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    _save(data)


def record_removed(provider: str) -> None:
    data = _load()
    entry = data.setdefault("providers", {}).setdefault(provider, {})
    entry["stored"] = False
    entry["removed_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    _save(data)
