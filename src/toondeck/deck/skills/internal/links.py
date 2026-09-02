"""Cross-platform link layer for skills views.

Windows: NTFS junctions (no admin rights needed). POSIX: directory symlinks.
Fallback: full copy + fingerprint hashing. Every skill view is one of these.

Dangling detection follows the approved LESSON: enumerate-and-stat — never
os.path.exists/Test-Path on a link, because a dangling junction lies to
exists(); a failed os.stat IS the signal.
"""

from __future__ import annotations

import hashlib
import os
import shutil
import stat as stat_mod
import sys
from pathlib import Path

_IS_WIN = sys.platform == "win32"


def link_kind(p: Path) -> str:
    """Classify a path: 'junction' | 'symlink' | 'dir' | 'file' | 'missing'."""
    try:
        st = os.lstat(p)
    except OSError:
        return "missing"
    if stat_mod.S_ISLNK(st.st_mode):
        return "symlink"
    reparse = getattr(st, "st_file_attributes", 0) & stat_mod.FILE_ATTRIBUTE_REPARSE_POINT
    if reparse and _IS_WIN:
        tag = getattr(st, "st_reparse_tag", 0)
        if tag == stat_mod.IO_REPARSE_TAG_MOUNT_POINT:
            return "junction"
        if tag:  # other reparse tags (OneDrive placeholders etc.) are not our links
            return "dir"
    if stat_mod.S_ISDIR(st.st_mode):
        return "dir"
    return "file"


def is_dangling(p: Path) -> bool:
    """True when a junction/symlink exists but its target is gone (stat fails)."""
    if link_kind(p) not in ("junction", "symlink"):
        return False
    try:
        os.stat(p)
        return False
    except OSError:
        return True


def make_link(link: Path, target: Path, force: str | None = None) -> str:
    """Create a view at `link` pointing at `target`. Returns the kind used.

    Order: junction (win) → symlink (posix) → copy. `force='copy'` skips links.
    Fails if `link` already exists — the reconcile layer decides replace vs keep.
    """
    link, target = Path(link), Path(target).resolve()
    if force == "copy":
        _copy_tree(link, target)
        return "copy"
    link.parent.mkdir(parents=True, exist_ok=True)
    if _IS_WIN:
        if _make_junction(link, target):
            return "junction"
    else:
        try:
            os.symlink(target, link, target_is_directory=True)
            return "symlink"
        except (OSError, NotImplementedError):
            pass
    _copy_tree(link, target)
    return "copy"


def read_target(link: Path) -> Path | None:
    """Resolved target of a junction/symlink, or None for non-links."""
    try:
        raw = os.readlink(link)
    except (OSError, ValueError):
        return None
    p = Path(raw)
    if str(p).startswith("\\\\?\\"):
        p = Path(str(p)[4:])
    try:
        return p.resolve()
    except OSError:
        return p


def remove_link(link: Path) -> bool:
    """Remove ONLY the link reparse point. Target content is never touched."""
    if link_kind(link) not in ("junction", "symlink"):
        return False
    try:
        os.rmdir(link)  # strips the reparse point; contents of target survive
        return True
    except OSError:
        return False


def dir_fingerprint(p: Path) -> str:
    """Stable short digest of a directory's full content tree (copy-drift check)."""
    h = hashlib.sha256()
    for root, dirs, files in os.walk(p):
        dirs.sort()
        for name in sorted(files):
            fp = Path(root) / name
            h.update(fp.relative_to(p).as_posix().encode("utf-8", "replace"))
            h.update(b"\0")
            try:
                h.update(fp.read_bytes())
            except OSError:
                pass
            h.update(b"\0")
    return h.hexdigest()[:16]


def _make_junction(link: Path, target: Path) -> bool:
    try:
        import _winapi

        # empirically verified order: (target, link) — junction is created AT link
        _winapi.CreateJunction(str(target), str(link))
        return True
    except Exception:
        return False


def _copy_tree(link: Path, target: Path) -> None:
    if link_kind(link) != "missing":
        raise FileExistsError(f"view already exists: {link}")
    shutil.copytree(target, link, symlinks=True)
