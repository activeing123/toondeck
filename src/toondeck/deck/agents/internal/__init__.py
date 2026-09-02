"""deck.agents internals — adapter registry + probes + process supervision."""

from __future__ import annotations

import json
from pathlib import Path

ADAPTERS_DIR = Path(__file__).resolve().parent.parent / "adapters"

REQUIRED_STR = ("id", "display_name")


def _validate(data: dict) -> None:
    for k in REQUIRED_STR:
        if not isinstance(data.get(k), str) or not data[k]:
            raise ValueError(f"adapter missing required string: {k}")
    if data["id"] != data.get("id"):
        raise ValueError("adapter id mismatch")
    for k in ("executable_probes", "dir_probes", "config_paths"):
        v = data.get(k, [])
        if not isinstance(v, list):
            raise ValueError(f"adapter field {k} must be a list")
    lc = data.get("launch_command")
    if lc is not None and (not isinstance(lc, list) or len(lc) == 0):
        raise ValueError("adapter launch_command must be a non-empty list or null")
    if not isinstance(data.get("env_config_support", False), bool):
        raise ValueError("adapter env_config_support must be bool")


def load_one(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    data.setdefault("dir_probes", [])
    data.setdefault("config_paths", [])
    data.setdefault("env_config_support", False)
    _validate(data)
    return data


def adapters_d() -> Path:
    """User-adopted adapters (T-065). Lives under TOONDECK_HOME, merged last."""
    import os

    home = os.environ.get("TOONDECK_HOME")
    root = Path(home) if home else Path.home() / ".toondeck"
    return root / "adapters.d"


def load_all(directory: Path | None = None) -> dict[str, dict]:
    d = directory or ADAPTERS_DIR
    out: dict[str, dict] = {}
    for p in sorted(d.glob("*.json")):
        a = load_one(p)
        out[a["id"]] = a
    if directory is None:  # user-adopted adapters only merge for the real registry
        extra = adapters_d()
        if extra.is_dir():
            for p in sorted(extra.glob("*.json")):
                a = load_one(p)
                out[a["id"]] = a
    return out


def default_home() -> Path:
    return Path.home()
