/*
 * backendError helper: the keyring token must become a localized, actionable
 * sentence; every other error keeps the server's own words.
 */
import { describe, expect, it } from "vitest";
import { backendError } from "./backendError";

const t = (k: string) => (k === "common.keyringUnavailable" ? "NO-KEYCHAIN-HINT" : `?${k}?`);

describe("backendError", () => {
  it("localizes the keyring_unavailable token and keeps the cause", () => {
    expect(backendError({ ok: false, error: "keyring_unavailable", detail: "Secret Service not running" }, t)).toBe(
      "NO-KEYCHAIN-HINT（Secret Service not running）",
    );
  });

  it("passes through any other server error verbatim", () => {
    expect(backendError({ ok: false, error: "duplicate name" }, t)).toBe("duplicate name");
  });

  it("falls back when the envelope carries nothing", () => {
    expect(backendError({ ok: false }, t)).toBe("request failed");
    expect(backendError(null, t, "save failed")).toBe("save failed");
  });
});
