# Security Policy

ToonDeck handles API keys, so this page matters more than it usually would.

## What ToonDeck guarantees

- API keys go **only** into the OS keychain (Windows Credential Manager, macOS
  Keychain, GNOME Keyring / KWallet on Linux). They are never written to a
  ToonDeck file, never logged, and never echoed back by any API response.
- Keys injected into a launched agent travel as environment variables of that
  agent's process on your machine. They do not leave the machine.
- When no usable keychain backend exists, ToonDeck **refuses to store** a key
  and tells you why, rather than falling back to disk.

## How to report a vulnerability

Use GitHub's **Private vulnerability reporting** (Security tab → Report a
vulnerability). Please do not open a public issue for anything security-related.

You will get a response within 7 days. Please include:

- ToonDeck version (output of `pip show toondeck`, or the commit you run from)
- OS and keychain backend
- What you expected vs. what happened, with as much of the request/response as
  you can share — **redact every key value** before sending

## What is NOT a ToonDeck vulnerability

- A process running as your user can read your OS keychain. That is the
  operating system's threat model, not ours — ToonDeck never has and never will
  be stronger than the keychain it sits on.
- An agent you deliberately launch can see the keys you deliberately injected
  into it. That is the feature working.
- The local console binds to `127.0.0.1` and trusts localhost. Anything that can
  already execute code as your user can do anything ToonDeck can.

## Supported versions

| Version | Supported |
| --- | --- |
| 0.2.x | yes |
| older | no — this project is pre-1.0, please update |
