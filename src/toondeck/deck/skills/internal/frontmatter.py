"""Skills frontmatter — minimal SKILL.md header parsing (stdlib regex, YAML subset).

Handles the agent-skills convention: a leading `---` block with
`name:` and `description:` (quoted or plain). Full YAML is out of scope;
the contract only needs these two keys plus tolerant parsing.
"""

from __future__ import annotations

import re

_BLOCK_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?", re.DOTALL)
_KV_RE = re.compile(r"^([A-Za-z_][\w-]*):\s*(.*?)\s*$")


def parse(text: str) -> tuple[dict, list[str]]:
    """Return (metadata, errors). Never raises — invalid frontmatter is a report."""
    if not text.lstrip().startswith("---"):
        return {}, ["missing frontmatter block (must start with ---)"]
    m = _BLOCK_RE.match(text.lstrip("\ufeff"))
    if not m:
        return {}, ["frontmatter block not closed (missing closing ---)"]
    meta: dict[str, str] = {}
    errors: list[str] = []
    for raw in m.group(1).splitlines():
        line = raw.rstrip()
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        kv = _KV_RE.match(line)
        if not kv:
            errors.append(f"unparsable frontmatter line: {line.strip()[:40]}")
            continue
        key, value = kv.group(1).lower(), kv.group(2)
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        meta[key] = value
    if not meta.get("name"):
        errors.append("frontmatter missing required key: name")
    if not meta.get("description"):
        errors.append("frontmatter missing required key: description")
    return meta, errors
