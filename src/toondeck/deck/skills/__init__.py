"""deck.skills — cross-platform skills sync engine (M2).

Operations (frozen contract):
- get_state()   → lean metadata view of the source of truth (bodies never ship)
- sync_all()    → derive the source to every agent view
- sync_one()    → re-derive ONE skill to every agent view (scoped, UX-017)
- remove_skill()→ the ONLY deletion entry (tombstone + graveyard)
- doctor()      → consistency report across source and all views
"""

from __future__ import annotations

from pathlib import Path

from .internal import frontmatter


def get_state() -> dict:
    """Scan the source dir; return lean per-skill metadata. Missing dir is not fatal."""
    from .internal import source_dir
    from .internal.reconcile import SKIP_SOURCE

    src = source_dir()
    skills = []
    if src.is_dir():
        for entry in sorted(src.iterdir()):
            if not entry.is_dir():
                continue
            # infra dirs (_index, .git, node_modules, …) are not skills:
            # state must agree with the engine's canon definition (R39)
            if entry.name in SKIP_SOURCE:
                continue
            md = entry / "SKILL.md"
            if not md.is_file():
                skills.append({"dirname": entry.name, "valid": False, "name": None,
                               "description": None, "errors": ["no SKILL.md"]})
                continue
            meta, errors = frontmatter.parse(md.read_text(encoding="utf-8", errors="replace"))
            valid = not errors
            skills.append({
                "dirname": entry.name,
                "valid": valid,
                "name": meta.get("name"),
                "description": meta.get("description"),
                "errors": errors,
            })
    # R44: human-friendly source path — home dirs collapse to ~ (the raw
    # absolute path stays in `source` for anyone who needs it; additive key).
    source = str(src)
    home = str(Path.home())
    source_display = source.replace(home, "~", 1) if source.startswith(home) else source
    return {
        "source": source,
        "source_display": source_display,
        "exists": src.is_dir(),
        "skills": skills,
        "counts": {
            "total": len(skills),
            "valid": sum(1 for s in skills if s["valid"]),
        },
    }


def sync_all() -> list[dict]:
    """Reconcile every agent view with the source. Per-agent isolation in results."""
    from .internal import reconcile

    return reconcile.run()


def sync_one(name: str) -> dict:
    """Single-skill sync (UX-017): re-derive ONE skill to every agent view.
    Scoped reconciliation — narrow writes, never touches sibling skills.
    Unknown or non-canon names return a clean error, never an exception."""
    from .internal import reconcile, source_dir
    from .internal.reconcile import SKIP_SOURCE

    if name.startswith(".") or name in SKIP_SOURCE:
        return {"ok": False, "error": f"refusing non-canon name: {name}"}
    if not (source_dir() / name).is_dir():
        return {"ok": False, "error": f"skill not found: {name}"}
    return {"ok": True, "name": name, "results": reconcile.run(only=name)}


def remove_skill(name: str) -> dict:
    """The ONLY deletion entry: archive to graveyard + tear down all views."""
    from .internal import maintenance

    return maintenance.remove_skill(name)


def doctor() -> dict:
    """Consistency exam: source lint + all six views + graveyard census."""
    from .internal import maintenance

    return maintenance.doctor()


def watcher(action: str) -> dict:
    """Daemon control: 'start' | 'stop' | 'status'. Source changes auto-reconcile."""
    from .internal.watcher import watcher as _w

    return _w(action)
