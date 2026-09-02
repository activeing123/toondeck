"""remove_skill + doctor — the maintenance pair.

Deletion has exactly ONE entry point. It archives (reversible), records a
ledger entry, and tears down every derived view so nothing can resurrect.
"""

from __future__ import annotations

import shutil
import time
from pathlib import Path

from . import links
from .frontmatter import parse as parse_frontmatter
from .reconcile import SKIP_SOURCE, canon_skills
from .views import ALL, FARM, FLAT, KEEP_LOCAL, WHOLE, view_path


def _graveyard(src: Path) -> Path:
    return src.parent / "graveyard"


def _record(src: Path, entry: dict) -> None:
    g = _graveyard(src)
    g.mkdir(parents=True, exist_ok=True)
    ledger = g / "ledger.json"
    data = json.loads(ledger.read_text(encoding="utf-8")) if ledger.is_file() else []
    data.append(entry)
    ledger.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


import json  # noqa: E402


def remove_skill(name: str) -> dict:
    from . import source_dir

    src = source_dir()
    if name.startswith(".") or name in KEEP_LOCAL or name in SKIP_SOURCE:
        return {"ok": False, "error": f"refusing non-canon name: {name}"}
    skill_dir = src / name
    if not skill_dir.is_dir():
        return {"ok": False, "error": f"skill not found: {name}"}

    removed = _graveyard(src) / "removed"
    removed.mkdir(parents=True, exist_ok=True)
    dest = removed / f"{time.strftime('%Y%m%d-%H%M%S')}_{name}"
    shutil.move(str(skill_dir), str(dest))
    _record(src, {"skill": name, "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
                  "from": str(skill_dir), "to": str(dest), "reason": "remove"})

    unlinked: list[str] = []
    for agent in FARM:
        link = view_path(agent) / name
        if links.link_kind(link) in ("junction", "symlink"):
            links.remove_link(link)
            unlinked.append(f"{agent}/{name}")
    for agent in FLAT:
        out = view_path(agent)
        if not out.is_dir():
            continue
        for f in sorted(out.iterdir()):
            owned = f.name == f"{name}.md" or f.name.startswith(f"{name}_")
            if owned and f.suffix in (".md", ".py"):
                f.unlink()
                unlinked.append(f"{agent}/{f.name}")
    return {"ok": True, "name": name, "archived_to": str(dest), "unlinked": unlinked}


def _check_whole(agent: str, src: Path, issues: list[str]) -> None:
    view = view_path(agent)
    kind = links.link_kind(view)
    if kind == "missing":
        issues.append("no link yet (never synced)")
    elif kind in ("junction", "symlink"):
        if links.is_dangling(view):
            issues.append("dangling link")
        elif links.read_target(view) != src.resolve():
            issues.append("link points at wrong target")
    else:
        issues.append("DRIFT: real directory where a link belongs")


def _check_farm(agent: str, src: Path, issues: list[str]) -> None:
    farm = view_path(agent)
    if not farm.is_dir():
        issues.append("farm directory missing (never synced)")
        return
    canon = {d.name for d in canon_skills(src)}
    for entry in sorted(farm.iterdir()):
        if entry.name.startswith(".") or entry.name in KEEP_LOCAL:
            continue
        kind = links.link_kind(entry)
        if kind in ("junction", "symlink"):
            if links.is_dangling(entry):
                issues.append(f"dangling farm link: {entry.name}")
        elif entry.name in canon:
            issues.append(f"DRIFT: real dir {entry.name} (source wins on next sync)")
        else:
            issues.append(f"stray real dir: {entry.name}")
    for name in sorted(canon):
        if links.link_kind(farm / name) == "missing":
            issues.append(f"missing link: farm/{name}")


def _check_flat(agent: str, src: Path, issues: list[str]) -> None:
    out = view_path(agent)
    if not out.is_dir():
        issues.append("derivation directory missing (never synced)")
        return
    valid = set()
    for d in canon_skills(src):
        md = d / "SKILL.md"
        if md.is_file():
            meta, errs = parse_frontmatter(md.read_text(encoding="utf-8", errors="replace"))
            if not errs:
                valid.add(d.name)
    for f in sorted(out.iterdir()):
        if f.suffix not in (".md", ".py"):
            continue
        if f.suffix == ".md":
            owner = f.name[:-3]
        else:
            stem = f.name[:-3]
            owner = next((c for c in valid if stem.startswith(c + "_")), None)
        if owner not in valid:
            issues.append(f"stale derived file: {f.name}")
    for name in sorted(valid):
        if not (out / f"{name}.md").is_file():
            issues.append(f"missing derived file: {name}.md")


def doctor() -> dict:
    from . import source_dir

    src = source_dir()
    invalid: list[str] = []
    lint: dict[str, list[str]] = {}
    total = 0
    if src.is_dir():
        dirs = [d for d in sorted(src.iterdir()) if d.is_dir() and not d.name.startswith(".")]
        total = len(dirs)
        for d in dirs:
            md = d / "SKILL.md"
            if not md.is_file():
                invalid.append(d.name)
                lint[d.name] = ["no SKILL.md"]
                continue
            _, errs = parse_frontmatter(md.read_text(encoding="utf-8", errors="replace"))
            if errs:
                invalid.append(d.name)
                lint[d.name] = errs

    views = []
    for agent in ALL:
        issues: list[str] = []
        if agent in WHOLE:
            _check_whole(agent, src, issues)
        elif agent in FARM:
            _check_farm(agent, src, issues)
        else:
            _check_flat(agent, src, issues)
        views.append({"agent": agent, "ok": not issues, "issues": issues})

    g = _graveyard(src)
    removed = len(list((g / "removed").iterdir())) if (g / "removed").is_dir() else 0
    clean = all(v["ok"] for v in views) and not invalid
    return {
        "source": {"exists": src.is_dir(), "total": total, "invalid": invalid, "lint": lint},
        "views": views,
        "graveyard": {"removed": removed},
        "summary": "ok" if clean else "degraded",
    }
