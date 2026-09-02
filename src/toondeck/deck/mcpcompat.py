"""deck.mcpcompat — runtime compatibility shim for mcptoon on Windows.

T-064: mcptoon's MCPClient resolves npx/cmd[0] to a `.cmd` shim path but then
Popen()s it directly. CreateProcess cannot execute .cmd/.bat without a shell
-> "[Errno 22] Invalid argument" on every stdio health probe for npm-based
MCP servers. We patch the spawn at runtime (mcptoon source untouched): if the
resolved executable is a .cmd/.bat, route through `cmd /c`; .ps1 -> pwsh.

Importing this module applies the patch exactly once. It is a no-op off
Windows. The proper upstream fix belongs in mcptoon (see TASK_GRAPH T-064);
this shim keeps ToonDeck functional against published mcptoon releases.
"""

from __future__ import annotations

import sys

_applied = False


def _apply() -> None:
    global _applied
    if _applied or sys.platform != "win32":
        return
    import shutil
    from pathlib import Path

    from mcptoon import client as mcptoon_client

    if getattr(mcptoon_client, "_toondeck_cmd_shim", False):
        return

    _orig_request = mcptoon_client.MCPClient._stdio_request

    _orig_init = mcptoon_client.MCPClient.__init__
    _orig_connect = None

    # Find the method that spawns the process and wrap Popen globally for this
    # module only: cleanest correct seam is to wrap MCPClient._stdio_request's
    # spawn — but the spawn happens in a private connect method. We instead
    # patch subprocess.Popen *as seen by mcptoon.client* via module attribute.
    if not hasattr(mcptoon_client, "subprocess"):
        return

    orig_popen = mcptoon_client.subprocess.Popen

    def _shimmed_popen(cmd, *a, **kw):
        """Resolve .cmd/.bat shims through cmd /c (CreateProcess can't run them)."""
        try:
            if isinstance(cmd, (list, tuple)) and cmd:
                resolved = shutil.which(str(cmd[0])) or (
                    shutil.which(str(cmd[0]) + ".cmd") if not str(cmd[0]).endswith(".cmd") else None
                )
                if resolved:
                    suffix = Path(resolved).suffix.lower()
                    if suffix in (".cmd", ".bat"):
                        cmd = ["cmd", "/c", resolved, *cmd[1:]]
                    elif suffix == ".ps1":
                        shell = shutil.which("pwsh") or shutil.which("powershell") or "powershell"
                        cmd = [shell, "-NoProfile", "-File", resolved, *cmd[1:]]
                    else:
                        cmd = [resolved, *cmd[1:]]
        except Exception:  # noqa: BLE001 — never break a spawn over the shim
            pass
        return orig_popen(cmd, *a, **kw)

    mcptoon_client.subprocess.Popen = _shimmed_popen
    mcptoon_client._toondeck_cmd_shim = True
    _applied = True


_apply()
