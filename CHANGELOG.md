# Changelog

All notable changes to ToonDeck are documented here. Dates are local ship dates;
every entry lists the gate numbers it shipped with.

## [0.2.0] — 2026-09-04

The UX hardening release: 13 campaign rounds (R25-R37) that took the deck
from "works" to "won't trap you". Test floor rose from pytest 176 / vitest 23
to pytest 182 / vitest 84.

### Fixed

- **Console landing card** no longer interpolates "undefined tools" — it reads
  the honest `/api/mcp/tools` inventory and hides itself when the payload is
  malformed (R25).
- **VaultPanel** was hardcoded English; now fully bilingual (R25).
- **`mcp.healthFailed`** had Chinese inside the English string (and vice versa);
  both sides purified (R30).
- **Skills empty-source incident (P0-1)**: the hub was hard-wired to
  `~/.toondeck/skills`, so a machine whose 302-skill farm lives elsewhere
  showed total=0 and a degraded doctor. The skills source is now configurable
  (`~/.toondeck/config.json` → `skills_source`), hub state always stays in the
  hub home, and adoption touches nothing on disk (R35). Live machine verified:
  302/302 valid, doctor 6/6.
- **Vault probe failure was a dead end** (UX-8): the store input only rendered
  while the key was NOT stored, so a failed probe (e.g. 401 after rotation)
  offered no way to re-store. A failed probe now names all three ways out
  (re-store / delete / switch model) and re-store works inline (R36).

### Added

- **In-app toasts + confirm dialog** replace every native `alert`/`confirm`
  (R26).
- **Per-agent pending states** — launching one agent no longer freezes the
  whole fleet's buttons (R27).
- **MCP health verdict card** — ok-rate, timeout/error counts, wall time,
  timeout cap, latency grading, and a re-run button (R28).
- **Keyboard accessibility** — digit hotkeys 1-6 (typing-target aware),
  `aria-current` nav, route-change focus landing, sidebar sections landmark
  (R29, R37).
- **Log filter view** — a read-only xterm is good for watching and useless for
  finding; the Logs center now buffers lines and offers a case-insensitive
  filter with an honest count and a 500-match cap message (R32).
- **Zero states** — Agents/Vault/Skills/MCP panels show an icon, an honest
  title, and the next action instead of a silent empty grid (R33).
- **Focus ring + micro-motion** — global deck-gold `focus-visible` ring, toast
  land and dialog rise animations, all disabled under `prefers-reduced-motion`
  (R34).

### Changed

- **English copy rewritten to native register** (R30) — "adopt" not "收养",
  probes not "试探", no unknown agents accounted for, etc.
- **Responsive shell** — mobile tab bar below md, desktop sidebar at md+,
  adaptive padding (R31).
- **Design veto sheet left the production nav** (PM-3): it is a dev tool; the
  route stays deep-linkable and `localStorage "toondeck.dev" = "1"` reveals
  the tab again without a rebuild (R37).

### Unreleased (pending user go)

- Landing page re-landing, mascot IP assets, per-skill actions, clickable
  fleet dashboard numbers — tracked in the UX ticket pool.
