"""Skills frontmatter — minimal SKILL.md header parsing (stdlib, YAML subset).

Tolerant to what real agent skills actually contain:
- plain `key: value` lines (quoted or not)
- folded (`>`, `>-`) and literal (`|`, `|-`) block scalars with indented lines
- nested maps (e.g. `metadata:` with sub-keys) — skipped, never an error

The contract only needs `name` + `description`; everything else is metadata.
"""

from __future__ import annotations

import re

_BLOCK_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?", re.DOTALL)
_KV_RE = re.compile(r"^([A-Za-z_][\w-]*):\s*(.*?)\s*$")
_BLOCK_MARKERS = {">", ">-", ">+", "|", "|-", "|+"}


def parse(text: str) -> tuple[dict, list[str]]:
    """Return (metadata, errors). Never raises — invalid frontmatter is a report."""
    if not text.lstrip().startswith("---"):
        return {}, ["missing frontmatter block (must start with ---)"]
    m = _BLOCK_RE.match(text.lstrip("\ufeff"))
    if not m:
        return {}, ["frontmatter block not closed (missing closing ---)"]
    meta: dict[str, str] = {}
    errors: list[str] = []
    lines = m.group(1).splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip() or line.lstrip().startswith("#"):
            i += 1
            continue
        if line[:1] in (" ", "\t"):
            i += 1  # continuation of a nested block — tolerated, not an error
            continue
        kv = _KV_RE.match(line)
        if not kv:
            errors.append(f"unparsable frontmatter line: {line.strip()[:40]}")
            i += 1
            continue
        key, value = kv.group(1).lower(), kv.group(2)
        marker = value.strip()
        if marker in _BLOCK_MARKERS:
            block: list[str] = []
            i += 1
            while i < len(lines) and lines[i][:1] in (" ", "\t"):
                block.append(lines[i].strip())
                i += 1
            value = " ".join(block) if marker.startswith(">") else "\n".join(block)
        else:
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
                value = value[1:-1]
            i += 1
        meta[key] = value
    if not meta.get("name"):
        errors.append("frontmatter missing required key: name")
    if not meta.get("description"):
        errors.append("frontmatter missing required key: description")
    return meta, errors
