"""Agent detection probes — honest evidence, never guesses.

probe kinds (from adapter JSON):
- executable_probes: ["name", ...]  → shutil.which on PATH
- dir_probes: ["~/.claude", ...]    → ~ expanded against the given home
- config_paths: ["~/.claude.json"]  → existence map (NOT contents — secrets stay put)
"""

from __future__ import annotations

import shutil
from pathlib import Path


def _probe_evidence(adapter: dict, home: Path) -> dict[str, bool]:
    evidence: dict[str, bool] = {}
    for name in adapter.get("executable_probes", []):
        evidence[f"exe:{name}"] = shutil.which(name) is not None
    for raw in adapter.get("dir_probes", []):
        p = Path(raw).expanduser() if raw.startswith("~") else Path(raw)
        evidence[f"dir:{raw}"] = p.is_dir()
    return evidence


def _config_evidence(adapter: dict, home: Path) -> dict[str, bool]:
    out: dict[str, bool] = {}
    for raw in adapter.get("config_paths", []):
        p = Path(raw).expanduser() if raw.startswith("~") else Path(raw)
        out[raw] = p.exists()
    return out


def detect(adapter: dict, home: Path | None = None) -> dict:
    home = home or Path.home()
    evidence = _probe_evidence(adapter, home)
    # NOTE: dir_probes contain ~ so Path.home() applies; for hermetic tests we
    # rewrite ~-paths against the injected home before probing.
    for raw in adapter.get("dir_probes", []):
        if raw.startswith("~"):
            p = home / raw[2:].replace("/", "\\") if "\\" in raw else home / raw[2:]
            evidence[f"dir:{raw}"] = p.is_dir()
    installed = any(evidence.values())
    return {
        "id": adapter["id"],
        "display_name": adapter["display_name"],
        "installed": installed,
        "evidence": evidence,
        "config_paths": _config_evidence(adapter, home),
        "skills_dir": adapter.get("skills_dir"),
        "launch_command": adapter.get("launch_command"),
        "env_config_support": adapter.get("env_config_support", False),
        "tui": bool(adapter.get("tui", False)),
    }
