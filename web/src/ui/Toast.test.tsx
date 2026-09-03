/*
R26 RED: window.alert blocks the main thread, cannot be styled, ignores the
language toggle, and stacks as sequential modal dialogs. Replace all five
call sites (AgentsPanel action errors, VaultPanel save/probe errors) with an
in-app toast: queued, auto-dismissing, language-aware, testable.
*/

import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ToastProvider, toast, useToasts } from "./Toast";

function Capture() {
  const { items } = useToasts();
  return (
    <ul>
      {items.map((t) => (
        <li key={t.id} data-kind={t.kind}>
          {t.text}
        </li>
      ))}
    </ul>
  );
}

describe("Toast", () => {
  afterEach(() => {
    vi_realTimers();
  });

  it("shows a pushed toast and auto-dismisses it", async () => {
    vi_fakeTimers();
    render(
      <ToastProvider>
        <Capture />
      </ToastProvider>,
    );
    act(() => toast.error("probe failed: ENOENT"));
    expect(screen.getByText("probe failed: ENOENT")).toBeInTheDocument();
    act(() => {
      advance(5000);
    });
    await waitFor(() => expect(screen.queryByText("probe failed: ENOENT")).toBeNull());
  });

  it("keeps up to 4 stacked toasts, drops oldest beyond that", () => {
    vi_fakeTimers();
    render(
      <ToastProvider>
        <Capture />
      </ToastProvider>,
    );
    act(() => {
      for (let i = 1; i <= 6; i++) toast.error(`err-${i}`);
    });
    const visible = screen.getAllByText(/^err-\d$/).map((li) => li.textContent);
    expect(visible).toEqual(["err-3", "err-4", "err-5", "err-6"]);
  });

  it("carries a kind for styling (error vs ok)", () => {
    vi_fakeTimers();
    render(
      <ToastProvider>
        <Capture />
      </ToastProvider>,
    );
    act(() => {
      toast.error("boom");
      toast.ok("saved");
    });
    expect(screen.getByText("boom").dataset.kind).toBe("error");
    expect(screen.getByText("saved").dataset.kind).toBe("ok");
  });
});

import { vi } from "vitest";

function vi_fakeTimers() {
  vi.useFakeTimers({ shouldAdvanceTime: true });
}

function vi_realTimers() {
  vi.useRealTimers();
}

function advance(ms: number) {
  vi.advanceTimersByTime(ms);
}
