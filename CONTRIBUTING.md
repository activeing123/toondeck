# Contributing

ToonDeck is pre-alpha and moving fast, so the rules are few and practical.

## The one rule

**Every fix comes with a gate.** This project was built that way from the start:
each regression you can find in the history is pinned by a test that fails before
the fix and passes after. If your fix has no test, the bug will be back, and so
will the conversation. A gate can be a pytest, a vitest, or — for "works
installed but not from source" bugs — a leg in `scripts/clean_room_check.py`.

## Setup

```bash
# backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
pytest

# frontend
cd web && pnpm install && pnpm test && pnpm build
```

The web UI is committed inside the package (`src/toondeck/deck/api/webui`), so
**UI changes must ship with a rebuild** — CI fails on drift, so this is not a
request. `cd web && pnpm build`, then commit the result together with the source.

## Conventions worth knowing before you open a PR

- **No secrets ever touch disk.** Keys go to the OS keychain via
  `vault/internal/store.py`, which is the only module allowed to touch a key
  value. Tests stub that module; production never falls back to a file.
- **One action, one word.** The i18n dictionary enforces terminology
  (`web/src/ui/TermConsistency.test.ts`). If you add a user-visible string, it
  goes in `web/src/i18n.tsx` in both languages — English values must be ASCII.
- **The clean-room gate is the boss.** `python scripts/clean_room_check.py`
  proves a fresh install on a machine that has never seen this repo. If it and
  the suites are green, your PR is in good shape.

## What to work on

The issue tracker is the list. Bugs with the `bug` label and no assignee are
fair game. For larger changes, open an issue first so the design gets settled
before the code does.
