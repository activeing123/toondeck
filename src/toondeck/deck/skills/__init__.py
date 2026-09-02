"""deck.skills — cross-platform skills sync engine (M2).

Operations (frozen contract):
- get_state()   → lean metadata view of the source of truth (bodies never ship)
- sync_all()    → derive the source to every agent view
- remove_skill()→ the ONLY deletion entry (tombstone + graveyard)
- doctor()      → consistency report across source and all views
"""

from __future__ import annotations

from .internal import frontmatter


def get_state() -> dict:
    """Scan the source dir; return lean per-skill metadata. Missing dir is not fatal."""
    from .internal import source_dir

    src = source_dir()
    skills = []
    if src.is_dir():
        for entry in sorted(src.iterdir()):
            if not entry.is_dir():
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
    return {
        "source": str(src),
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


def remove_skill(name: str) -> dict:
    """The ONLY deletion entry: archive to graveyard + tear down all views."""
    from .internal import maintenance

    return maintenance.remove_skill(name)


def doctor() -> dict:
    """Consistency exam: source lint + all six views + graveyard census."""
    from .internal import maintenance

    return maintenance.doctor()
