"""R20 RED-ish: the Windows .cmd spawn shim routes .cmd/.bat through cmd /c.

cmd.exe has hostile quoting rules (backslash-escaped quotes don't exist, %VAR%
expansion, & splitting). Agent configs routinely carry args like "C:\Program
Files\..." or "(x)" — this test pins that args survive the shim VERBATIM.
Evidence decides: if cmd /c mangles any of these, the shim needs cmd-aware
quoting.
"""

import subprocess

import toondeck.deck.mcpcompat  # noqa: F401 — must be applied before anything else


def _shimmed_popen():
    """Get the shimmed Popen by re-importing the module the shim patched."""
    import mcptoon.client as mcptoon_client

    assert getattr(mcptoon_client, "_toondeck_cmd_shim", False), "shim not applied"
    return mcptoon_client.subprocess.Popen


def test_cmd_shim_preserves_tricky_args(tmp_path):
    probe_dir = tmp_path / "pro gram"  # spaces in the resolved path, on purpose
    probe_dir.mkdir()
    script = probe_dir / "run.cmd"
    script.write_text("@echo off\nfor %%a in (%*) do echo ARG=[%%~a]\n", encoding="ascii")
    # %%~a = the standard batch dequote — args arrive as normal quoted Windows
    # tokens (calling convention), and %%~a recovers the verbatim content.

    popen = _shimmed_popen()
    args = ["hello world", "a&b", "(x)", "100%"]
    p = popen([str(script), *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
              text=True)
    out, _err = p.communicate(timeout=30)
    assert p.returncode == 0, f"cmd /c failed:\n{out}\n{_err}"

    got = [ln[5:-1] for ln in out.splitlines() if ln.startswith("ARG=[")]
    assert got == args, (
        f"args mangled by the cmd /c shim:\n  sent: {args}\n  got:  {got}"
    )
