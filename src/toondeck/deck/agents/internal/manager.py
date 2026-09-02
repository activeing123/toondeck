"""Process supervisor — handle table, log ring buffer, clean stop, zombie reap.

One AgentProcess per running agent. Reader threads pump stdout/stderr into a
bounded deque and fan out to WebSocket subscribers. Every line passes the
redaction gateway BEFORE storage — secrets never even rest in memory buffers.
"""

from __future__ import annotations

import os
import queue
import re
import shutil
import subprocess
import threading
import time
from collections import deque
from pathlib import Path

RING_SIZE = 500

# Redaction gateway: known token shapes → placeholder. Conservative list,
# broad enough for sk-/ghp_/AKIA/Bearer/Slack/GitLab families.
_REDACT_RES = [
    re.compile(r"sk-[A-Za-z0-9_-]{8,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9]{8,}"),
    re.compile(r"github_pat_[A-Za-z0-9_]{8,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"xox[bpars]-[A-Za-z0-9-]{8,}"),
    re.compile(r"glpat-[A-Za-z0-9_-]{8,}"),
    re.compile(r"(?i)bearer\s+[A-Za-z0-9._-]{8,}"),
]
_REDACTED = "***REDACTED***"


def _resolve_windows_cmd(cmd: list[str]) -> list[str]:
    """Windows can't CreateProcess .CMD/.PS1 directly (npm shims!) — wrap them.

    `claude`, `codex`, `cursor` are npm shims on this platform: Popen would
    raise WinError 2 even though shutil.which finds them. Route through cmd /c
    (or pwsh for .ps1) with the fully-resolved script path.
    """
    if os.name != "nt":
        return cmd
    resolved = shutil.which(cmd[0])
    if not resolved:
        return cmd
    suffix = Path(resolved).suffix.lower()
    if suffix in (".cmd", ".bat"):
        return ["cmd", "/c", resolved, *cmd[1:]]
    if suffix == ".ps1":
        shell = shutil.which("pwsh") or shutil.which("powershell") or "powershell"
        return [shell, "-NoProfile", "-File", resolved, *cmd[1:]]
    return cmd


def redact(line: str) -> str:
    for rx in _REDACT_RES:
        line = rx.sub(_REDACTED, line)
    return line


class AgentProcess:
    def __init__(self, agent_id: str, process: subprocess.Popen) -> None:
        self.agent_id = agent_id
        self.process = process
        self.started_at = time.time()
        self.exit_code: int | None = None
        self.logs: deque[str] = deque(maxlen=RING_SIZE)
        self.subscribers: list[queue.Queue] = []
        self._lock = threading.Lock()
        for stream in (process.stdout, process.stderr):
            if stream is not None:
                t = threading.Thread(target=self._pump, args=(stream,), daemon=True)
                t.start()

    def _pump(self, stream) -> None:
        try:
            for raw in iter(stream.readline, ""):
                if not raw:
                    break
                line = redact(raw.rstrip("\r\n"))
                with self._lock:
                    self.logs.append(line)
                    subs = list(self.subscribers)
                for q in subs:
                    try:
                        q.put_nowait(line)
                    except queue.Full:
                        pass
        finally:
            try:
                stream.close()
            except OSError:
                pass

    def running(self) -> bool:
        return self.process.poll() is None

    def reap(self) -> None:
        """Collect exit code once the process is gone (zombie reaping)."""
        if self.exit_code is None and not self.running():
            self.exit_code = self.process.returncode

    def snapshot(self) -> list[str]:
        with self._lock:
            return list(self.logs)

    def subscribe(self) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=1000)
        with self._lock:
            self.subscribers.append(q)
        return q

    def unsubscribe(self, q: queue.Queue) -> None:
        with self._lock:
            if q in self.subscribers:
                self.subscribers.remove(q)

    def stop(self, timeout: float = 5.0) -> int | None:
        if self.running():
            try:
                self.process.terminate()
                self.process.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=timeout)
            except OSError:
                pass
        self.reap()
        return self.exit_code


_manager: "Manager | None" = None


class Manager:
    def __init__(self) -> None:
        self.procs: dict[str, AgentProcess] = {}

    def launch(
        self,
        agent_id: str,
        adapter: dict,
        cwd: Path | None = None,
        args: list[str] | None = None,
        env_extra: dict[str, str] | None = None,
        window: bool | None = None,
    ) -> dict:
        cmd = adapter.get("launch_command")
        if not cmd:
            return {"ok": False, "error": f"{agent_id} has no launch command (GUI-only agent)"}
        if args:
            cmd = [*cmd, *args]

        # TUI agents (codex, claude REPL, ...) die with "stdin is not a
        # terminal" under pipes. Default: launch in a NEW CONSOLE window the
        # user can actually drive. Explicit window=False forces pipe mode.
        use_window = bool(adapter.get("tui")) if window is None else window

        model = None
        try:
            from ... import agents as agents_pkg

            model = agents_pkg.get_model(agent_id)
        except Exception:  # noqa: BLE001 — model preference must never block launch
            model = None
        if model:
            if adapter.get("model_env"):
                env_extra = dict(env_extra or {})
                env_extra.setdefault(adapter["model_env"], model)
            elif adapter.get("model_arg"):
                cmd = [*cmd[:1], adapter["model_arg"], model, *cmd[1:]]
        old = self.procs.get(agent_id)
        if old is not None and old.running():
            return {"ok": False, "error": f"{agent_id} is already running (pid {old.process.pid})"}
        try:
            child_env = None
            if env_extra:
                import os as _os

                child_env = dict(_os.environ)
                child_env.update(env_extra)
            popen_kw: dict = {}
            mode = "pipe"
            if use_window and os.name == "nt":
                popen_kw["creationflags"] = subprocess.CREATE_NEW_CONSOLE
                mode = "window"
            else:
                popen_kw.update(
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                )
            proc = subprocess.Popen(
                _resolve_windows_cmd(cmd),
                cwd=str(cwd) if cwd else None,
                env=child_env,
                **popen_kw,
            )
        except OSError as e:
            return {"ok": False, "error": f"spawn failed: {e}"}
        self.procs[agent_id] = AgentProcess(agent_id, proc)
        return {"ok": True, "agent_id": agent_id, "pid": proc.pid, "mode": mode}

    def stop(self, agent_id: str) -> dict:
        proc = self.procs.get(agent_id)
        if proc is None:
            return {"ok": False, "error": f"{agent_id} was never launched here"}
        code = proc.stop()
        return {"ok": True, "agent_id": agent_id, "exit_code": code}

    def status(self, agent_id: str) -> dict:
        proc = self.procs.get(agent_id)
        if proc is None:
            return {"agent_id": agent_id, "state": "never", "logs": [], "exit_code": None}
        proc.reap()
        return {
            "agent_id": agent_id,
            "pid": proc.process.pid,
            "state": "running" if proc.running() else "exited",
            "exit_code": proc.exit_code,
            "started_at": proc.started_at,
            "logs": list(proc.logs)[-100:],
        }

    def status_all(self) -> dict[str, dict]:
        for aid in list(self.procs):
            self.procs[aid].reap()
        return {
            aid: {
                "state": "running" if p.running() else "exited",
                "exit_code": p.exit_code,
                "pid": p.process.pid,
            }
            for aid, p in self.procs.items()
        }


def get_manager() -> Manager:
    global _manager
    if _manager is None:
        _manager = Manager()
    return _manager
