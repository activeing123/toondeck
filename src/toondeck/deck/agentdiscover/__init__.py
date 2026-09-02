"""deck.agentdiscover — universal agent discovery (ADR-023 four-layer funnel).

Layer 2: signature DB (~26 curated agents, pure data, ships per release).
Layer 3: mcpServers fingerprint — any config dir carrying an MCP map is a
         signal of an agent, even one we've never heard of.
Layer 4: adoption — turn an unknown dir into a draft adapter JSON under
         TOONDECK_HOME/adapters.d; the registry merges it automatically.
(Layer 1 = the 7 hand-tuned adapters in deck.agents.)
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from . import internal


def signature_db() -> list[dict]:
    return internal.load_signature_db()


def _known_dirnames() -> set[str]:
    known: set[str] = set()
    for entry in signature_db():
        for d in entry.get("dirs", []):
            known.add(d.split("/")[0].lstrip(".").lower())
    return known


def fingerprint(home: Path | None = None) -> list[dict]:
    """Config files anywhere in the scan roots that carry MCP maps."""
    home = home or Path.home()
    hits: list[dict] = []
    seen = 0
    for root in internal.scan_roots(home):
        try:
            for f in root.iterdir():
                if seen >= internal.SCAN_CAP:
                    return hits
                seen += 1
                if f.is_file() and f.suffix in (".json", ".toml") and (
                    f.name.lower() in internal.MCP_FILENAMES or "mcp" in f.name.lower()
                ):
                    if internal.looks_like_mcp(f):
                        hits.append({"path": str(f), "dir": root.name})
        except OSError:
            continue
    return hits


def unknown_agents(home: Path | None = None) -> list[dict]:
    """Distinct config dirs with MCP maps that no signature entry claims."""
    home = home or Path.home()
    known = _known_dirnames()
    out: dict[str, dict] = {}
    for hit in fingerprint(home):
        label = hit["dir"].lstrip(".").lower() if hit["dir"].startswith(".") else hit["dir"].lower()
        if label in known or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{1,30}", label):
            continue
        if label not in out:
            out[label] = {
                "label": label,
                "config_files": [hit["path"]],
                "evidence": "mcpServers fingerprint",
            }
        else:
            out[label]["config_files"].append(hit["path"])
    return list(out.values())


def adopt(label: str, launch_command: list[str] | None = None, home: Path | None = None) -> dict:
    """Write a draft adapter for an unknown agent into TOONDECK_HOME/adapters.d."""
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{1,30}", label):
        return {"ok": False, "error": f"bad label: {label!r}"}
    if launch_command is not None and (
        not isinstance(launch_command, list) or not launch_command
    ):
        return {"ok": False, "error": "launch_command must be a non-empty list or null"}
    display = label.replace("-", " ").replace("_", " ").strip().title()
    adapter = {
        "id": label,
        "display_name": display,
        "executable_probes": [launch_command[0]] if launch_command else [],
        "dir_probes": [f"~/.{label}"],
        "config_paths": [],
        "skills_dir": None,
        "launch_command": launch_command,
        "env_config_support": False,
        "adopted": True,
    }
    import os

    thome = os.environ.get("TOONDECK_HOME")
    root = Path(thome) if thome else Path.home() / ".toondeck"
    dest = root / "adapters.d"
    dest.mkdir(parents=True, exist_ok=True)
    (dest / f"{label}.json").write_text(
        json.dumps(adapter, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return {"ok": True, "label": label, "adapter": str(dest / f"{label}.json")}


def discover_all(home: Path | None = None) -> dict:
    return {"unknown": unknown_agents(home=home), "signatures": len(signature_db())}
