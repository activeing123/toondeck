"""sync_all reconciliation engine — v7 semantics, productized.

Laws (violations are how resurrection/loss accidents happen):
- a REAL directory sitting where a link belongs is DRIFT → archive, then relink
- the source always wins; local coexistence only via KEEP_LOCAL dot-dirs
- archived content is never deleted: graveyard + ledger, reversible
"""

from __future__ import annotations

import json
import shutil
import time
from pathlib import Path

from . import links
from .frontmatter import parse as parse_frontmatter
from .views import ALL, FARM, FLAT, KEEP_LOCAL, WHOLE, view_path

SKIP_SOURCE = {".git", "__pycache__", "node_modules", "_index", ".DS_Store"}


def canon_skills(src: Path) -> list[Path]:
    if not src.is_dir():
        return []
    return [
        d
        for d in sorted(src.iterdir())
        if d.is_dir() and not d.name.startswith(".") and d.name not in SKIP_SOURCE
    ]


def _archive_dir(agent: str, p: Path, reason: str, src: Path, actions: list[str]) -> None:
    """Move drifted/stray content into the graveyard. NEVER into deletion."""
    p_res, src_res = p.resolve(), src.resolve()
    if p_res == src_res or src_res in p_res.parents:
        raise RuntimeError(f"refusing to archive the source itself via {p}")
    graveyard = src.parent / "archive" / "strays"
    graveyard.mkdir(parents=True, exist_ok=True)
    dest = graveyard / f"{time.strftime('%Y%m%d-%H%M%S')}_{agent}_{p.name}"
    if dest.exists():
        dest = dest.with_name(dest.name + "-" + str(int(time.time() * 1000) % 10000))
    shutil.move(str(p), str(dest))
    actions.append(f"archive {reason} {p.name} -> graveyard")
    ledger = src.parent / "archive" / "ledger.json"
    data = json.loads(ledger.read_text(encoding="utf-8")) if ledger.is_file() else []
    data.append({"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), "agent": agent,
                 "from": str(p), "to": str(dest), "reason": reason})
    ledger.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _reconcile_whole(agent: str, src: Path, actions: list[str]) -> None:
    view = view_path(agent)
    kind = links.link_kind(view)
    if kind == "missing":
        links.make_link(view, src)
        actions.append(f"create whole link {agent}")
        return
    if kind in ("junction", "symlink"):
        if links.is_dangling(view) or links.read_target(view) != src.resolve():
            links.remove_link(view)
            links.make_link(view, src)
            actions.append(f"repair whole link {agent}")
        return
    _archive_dir(agent, view, "drift", src, actions)
    links.make_link(view, src)
    actions.append(f"relink after drift {agent}")


def _reconcile_farm(agent: str, src: Path, actions: list[str]) -> None:
    farm = view_path(agent)
    farm.mkdir(parents=True, exist_ok=True)
    canon = {d.name: d for d in canon_skills(src)}
    for entry in sorted(farm.iterdir()):
        name = entry.name
        if name in KEEP_LOCAL or name.startswith("."):
            continue
        kind = links.link_kind(entry)
        if kind in ("junction", "symlink"):
            if links.is_dangling(entry):
                links.remove_link(entry)
                if name in canon:
                    links.make_link(entry, canon[name])
                    actions.append(f"heal farm/{name}")
                else:
                    actions.append(f"unlink dangling farm/{name}")
            continue
        if name in canon:
            _archive_dir(agent, entry, "stray", src, actions)
            links.make_link(entry, canon[name])
            actions.append(f"relink farm/{name} (source wins)")
        else:
            _archive_dir(agent, entry, "stray", src, actions)
    for name, d in canon.items():
        link = farm / name
        if links.link_kind(link) == "missing":
            links.make_link(link, d)
            actions.append(f"link farm/{name}")


def _reconcile_flat(agent: str, src: Path, actions: list[str]) -> None:
    out = view_path(agent)
    out.mkdir(parents=True, exist_ok=True)
    canon = {d.name: d for d in canon_skills(src)}
    valid: set[str] = set()
    for name, d in canon.items():
        md = d / "SKILL.md"
        if not md.is_file():
            continue  # doctor reports these
        _, errs = parse_frontmatter(md.read_text(encoding="utf-8", errors="replace"))
        if errs:
            continue  # broken frontmatter: never derived, doctor owns the report
        valid.add(name)
        text = md.read_text(encoding="utf-8", errors="replace")
        dest = out / f"{name}.md"
        if not dest.is_file() or dest.read_text(encoding="utf-8", errors="replace") != text:
            dest.write_text(text, encoding="utf-8")
            actions.append(f"write {name}.md")
        for item in sorted(d.iterdir()):
            if item.is_file() and item.suffix == ".py" and item.name != "SKILL.md":
                target = out / f"{name}_{item.name}"
                if not target.is_file() or links.dir_fingerprint(item) != links.dir_fingerprint(target):
                    shutil.copy2(item, target)
                    actions.append(f"copy {name}_{item.name}")
    for f in sorted(out.iterdir()):
        if f.suffix not in (".md", ".py"):
            continue
        if f.suffix == ".md":
            owner = f.name[:-3]
        else:
            stem = f.name[:-3]
            owner = next((c for c in valid if stem.startswith(c + "_")), None)
        if owner not in valid:
            f.unlink()
            actions.append(f"remove stale {f.name}")


def run() -> list[dict]:
    from . import source_dir

    src = source_dir()
    results = []
    for agent in ALL:
        actions: list[str] = []
        try:
            if agent in WHOLE:
                _reconcile_whole(agent, src, actions)
            elif agent in FARM:
                _reconcile_farm(agent, src, actions)
            elif agent in FLAT:
                _reconcile_flat(agent, src, actions)
            results.append({"agent": agent, "ok": True, "actions": actions})
        except Exception as e:  # noqa: BLE001 — per-agent isolation, reported not raised
            results.append({"agent": agent, "ok": False, "actions": actions, "error": str(e)})
    return results
