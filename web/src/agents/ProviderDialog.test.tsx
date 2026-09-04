/*
 * R46 — ProviderDialog: elegant editing replaces the low inline inputs.
 * Contract: labeled fields (not bare placeholders), key show/hide toggle,
 * blank-key-keeps-stored hint in edit mode, required-key validation in
 * enable mode, Escape closes, disabled name field for catalog providers.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { ProviderDialog, type ProviderDraft } from "./ProviderDialog";

function renderDialog(draft: ProviderDraft, onSubmit = vi.fn()) {
  return render(
    <I18nProvider>
      <ProviderDialog draft={draft} onClose={vi.fn()} onSubmit={onSubmit} />
    </I18nProvider>,
  );
}

const enableDraft: ProviderDraft = {
  mode: "enable",
  id: "deepseek",
  displayName: "DeepSeek",
  baseUrl: "https://api.deepseek.com/v1",
  hasStoredKey: false,
  keyless: false,
};

describe("ProviderDialog (R46)", () => {
  it("enable mode: empty required key shows an error, never submits", async () => {
    const onSubmit = vi.fn();
    renderDialog(enableDraft, onSubmit);
    await userEvent.click(screen.getByTestId("pd-save"));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("enable mode: valid key submits through onSubmit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderDialog(enableDraft, onSubmit);
    await userEvent.type(screen.getByTestId("pd-key"), "sk-abc");
    await userEvent.click(screen.getByTestId("pd-save"));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "deepseek", apiKey: "sk-abc" }),
    );
  });

  it("edit mode: name is locked, key starts blank with keep-stored hint", () => {
    renderDialog({ ...enableDraft, mode: "edit", hasStoredKey: true });
    expect(screen.getByTestId("pd-name")).toBeDisabled();
    expect(screen.getByTestId("pd-name")).toHaveValue("deepseek");
    expect(screen.getByTestId("pd-key")).toHaveValue("");
    expect(screen.getByText(/leave blank to keep the stored key|留空则保留已存密钥/)).toBeInTheDocument();
    expect(screen.getByText(/key stored|密钥已存/)).toBeInTheDocument();
  });

  it("custom mode: name is editable and focused", () => {
    renderDialog({
      mode: "custom",
      id: "",
      displayName: "custom source",
      baseUrl: "",
      hasStoredKey: false,
      keyless: false,
    });
    const name = screen.getByTestId("pd-name");
    expect(name).toBeEnabled();
    expect(name).toHaveFocus();
  });

  it("key show/hide toggle flips input type", async () => {
    renderDialog(enableDraft);
    const key = screen.getByTestId("pd-key");
    expect(key).toHaveAttribute("type", "password");
    await userEvent.click(screen.getByRole("button", { name: /show key|显示密钥/ }));
    expect(screen.getByTestId("pd-key")).toHaveAttribute("type", "text");
  });

  it("escape closes the dialog", async () => {
    const onClose = vi.fn();
    render(
      <I18nProvider>
        <ProviderDialog draft={enableDraft} onClose={onClose} onSubmit={vi.fn()} />
      </I18nProvider>,
    );
    await userEvent.type(screen.getByTestId("pd-url"), "{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
