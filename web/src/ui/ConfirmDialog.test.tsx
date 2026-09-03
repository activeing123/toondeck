/*
R26 part 2: destructive actions (sync overwrites agent configs, delete
removes a keychain entry) must not use window.confirm — native dialogs are
unstyled, untranslated chrome that steals focus. A ConfirmDialog component
owns the flow: i18n copy, danger-styled confirm button, Escape to cancel.
*/

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";
import { I18nProvider } from "../i18n";

function renderDialog(onConfirm: () => void, onCancel: () => void) {
  render(
    <I18nProvider>
      <ConfirmDialog
        messageKey="mcp.syncWarn"
        confirmLabel="sync now"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </I18nProvider>,
  );
}

describe("ConfirmDialog", () => {
  it("renders the i18n message and fires confirm only on confirm", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderDialog(onConfirm, onCancel);

    expect(screen.getByText(/overwriting its MCP server list/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "sync now" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancel button and Escape both cancel without confirming", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const first = render(
      <I18nProvider>
        <ConfirmDialog
          messageKey="mcp.syncWarn"
          confirmLabel="sync now"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    first.unmount();

    render(
      <I18nProvider>
        <ConfirmDialog
          messageKey="mcp.syncWarn"
          confirmLabel="sync now"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      </I18nProvider>,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
