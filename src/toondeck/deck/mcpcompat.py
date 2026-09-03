"""deck.mcpcompat — runtime compatibility shim for mcptoon on Windows.

T-064 (revised after live-fire evidence): mcptoon stdio probes fail with
"[Errno 22] Invalid argument" when the server process dies and the client
writes to its stdin — a broken pipe surfacing as EINVAL. Users deserve
"PROCESS_DIED + stderr" instead. This module wraps MCPClient._stdio_request
to classify that case, and additionally hardens spawn for .cmd/.bat/.ps1
executables (cmd /c routing). mcptoon source is never modified.
"""

from __future__ import annotations

import sys

_applied = False


def _apply() -> None:
    global _applied
    if _applied or sys.platform != "win32":
        return
    from mcptoon import client as mcptoon_client

    if getattr(mcptoon_client, "_toondeck_cmd_shim", False):
        return

    # 1) Dead-stdin write (EINVAL 22) -> honest MCPError with stderr excerpt.
    # mcptoon 0.7.4's response pump passes `timeout=` to _stdio_request; the
    # shim must accept and forward it or every probed request TypeErrors.
    orig_request = mcptoon_client.MCPClient._stdio_request

    def _classified_request(self, payload: bytes, timeout: float | None = None) -> dict:
        try:
            if timeout is None:
                return orig_request(self, payload)
            return orig_request(self, payload, timeout=timeout)
        except OSError as e:
            if e.errno == 22:
                stderr = ""
                try:
                    if self._proc is not None and self._proc.stderr:
                        stderr = self._proc.stderr.read().decode("utf-8", errors="replace")[:300]
                except Exception:  # noqa: BLE001
                    pass
                raise mcptoon_client.MCPError(
                    "PROCESS_DIED",
                    f"server process exited before responding. stderr: {stderr}",
                ) from e
            raise

    mcptoon_client.MCPClient._stdio_request = _classified_request

    # 2) Spawn hardening: .cmd/.bat via cmd /c, .ps1 via pwsh -File.
    if hasattr(mcptoon_client, "subprocess"):
        import shutil
        from pathlib import Path

        orig_popen = mcptoon_client.subprocess.Popen

        def _shimmed_popen(cmd, *a, **kw):
            try:
                if isinstance(cmd, (list, tuple)) and cmd:
                    resolved = shutil.which(str(cmd[0])) or (
                        shutil.which(str(cmd[0]) + ".cmd")
                        if not str(cmd[0]).endswith(".cmd")
                        else None
                    )
                    if resolved:
                        suffix = Path(resolved).suffix.lower()
                        if suffix in (".cmd", ".bat"):
                            # Two cmd.exe traps (verified empirically, R20):
                            # (1) plain list2cmdline only quotes args containing
                            #     whitespace, so 'a&b' / '(x)' reach cmd UNQUOTED
                            #     and & splits commands; (2) without /s, cmd /c
                            #     strips the first+last quote of the whole line,
                            #     breaking spaced paths. Fix: quote EVERY arg
                            #     cmd-style (internal " doubled), then wrap the
                            #     whole line in an extra quote pair under /s —
                            #     the Windows-sanctioned construction.
                            def _cmd_quote(arg: str) -> str:
                                return '"' + arg.replace('"', '""') + '"'

                            inner = " ".join(_cmd_quote(a) for a in [resolved, *cmd[1:]])
                            return orig_popen(f'cmd /s /c "{inner}"', *a, **kw)
                        if suffix == ".ps1":
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
