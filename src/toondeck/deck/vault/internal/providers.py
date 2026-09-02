"""Provider catalog — 8 first-class providers, JSON-driven."""

from __future__ import annotations

import json

from . import PROVIDERS_JSON


def load_all() -> dict:
    return json.loads(PROVIDERS_JSON.read_text(encoding="utf-8"))
