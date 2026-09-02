"""deck.vault internals — provider catalog, metadata, keyring store, probes."""

from __future__ import annotations

import json
import os
from pathlib import Path

PROVIDERS_JSON = Path(__file__).resolve().parent / "providers.json"


def vault_home() -> Path:
    env = os.environ.get("TOONDECK_HOME")
    return Path(env) if env else Path.home() / ".toondeck"


def vault_file() -> Path:
    return vault_home() / "vault.json"
