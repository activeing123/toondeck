/*
 * R48 — Vault: the page now (a) explains how to configure it, and
 * (b) lets users define their own providers instead of only the 8 baked
 * into the package. Contract:
 * - the guide renders the 3 steps + alias note (keyboard-reachable, no hover)
 * - "+ custom provider" opens the dialog; submit POSTs the definition
 * - a custom provider gets a visible badge + edit/remove affordances
 * - backend validation errors surface inline, never as a dead button
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VaultProviderDialog, type ProviderFormDraft } from "./VaultProviderDialog";
import VaultPanel from "./VaultPanel";

const draft: ProviderFormDraft = {
  mode: "create",
  id: "",
  display_name: "",
  env_var: "",
  base_url: "",
  test_url: "",
  auth_style: "bearer",
  local: false,
};

describe("VaultProviderDialog (R48)", () => {
  it("create mode: fill fields, POSTs the definition with a normalized env var", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    render(<VaultProviderDialog draft={draft} onClose={vi.fn()} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByTestId("vp-id"), "mygateway");
    await userEvent.type(screen.getByTestId("vp-display"), "My Gateway");
    await userEvent.type(screen.getByTestId("vp-env"), "mygateway_api_key");
    await userEvent.type(screen.getByTestId("vp-base"), "https://gw.example.com/v1");
    await userEvent.click(screen.getByTestId("vp-save"));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "mygateway",
        display_name: "My Gateway",
        env_var: "MYGATEWAY_API_KEY", // uppercased as you type
        base_url: "https://gw.example.com/v1",
        mode: "create",
      }),
    );
  });

  it("edit mode: id locked, existing spec pre-filled", () => {
    render(
      <VaultProviderDialog
        draft={{
          ...draft,
          mode: "edit",
          id: "mygateway",
          display_name: "My Gateway",
          env_var: "MYGATEWAY_API_KEY",
          base_url: "https://gw.example.com/v1",
        }}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    const id = screen.getByTestId("vp-id") as HTMLInputElement;
    expect(id.disabled).toBe(true);
    expect(id.value).toBe("mygateway");
    expect((screen.getByTestId("vp-base") as HTMLInputElement).value).toBe(
      "https://gw.example.com/v1",
    );
  });

  it("backend validation errors surface inline with role=alert", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: false, error: "base_url must start with http:// or https://" });
    render(<VaultProviderDialog draft={draft} onClose={vi.fn()} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByTestId("vp-save"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/base_url/);
  });
});

const vaultState = {
  providers: [
    {
      id: "openai",
      display_name: "OpenAI",
      env_var: "OPENAI_API_KEY",
      base_url: "https://api.openai.com/v1",
      test_url: "https://api.openai.com/v1/models",
      auth_style: "bearer",
      local: false,
      custom: false,
      stored: false,
      set_at: null,
      last_test: null,
    },
    {
      id: "mygateway",
      display_name: "My Gateway",
      env_var: "MYGATEWAY_API_KEY",
      base_url: "https://gw.example.com/v1",
      test_url: "https://gw.example.com/v1/models",
      auth_style: "bearer",
      local: false,
      custom: true,
      stored: false,
      set_at: null,
      last_test: null,
    },
  ],
  stored_count: 0,
};

function mockFetch() {
  return vi.fn((url: string) => {
    if (url === "/api/vault/state") {
      return Promise.resolve({ json: () => Promise.resolve(vaultState) });
    }
    if (url === "/api/health") {
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            ok: true,
            service: "toondeck",
            version: "0.1.0",
            engine: { available: true, version: "0.7.1" },
          }),
      });
    }
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("VaultPanel R48 guide + custom providers", () => {
  beforeEach(() => {
    window.location.hash = "#/vault";
  });

  it("renders the three-step guide without hover-only explanations", async () => {
    vi.stubGlobal("fetch", mockFetch());
    render(<VaultPanel />);
    expect(await screen.findByTestId("vault-guide")).toBeInTheDocument();
    // ① ② ③ steps visible as text — no title-attribute-only secrets
    expect(screen.getByText(/①/)).toBeInTheDocument();
    expect(screen.getByText(/③/)).toBeInTheDocument();
    // the custom-provider entry point is a real button
    expect(screen.getByTestId("vault-add-provider")).toBeInTheDocument();
  });

  it("custom providers get badge + edit affordance; built-ins do not", async () => {
    vi.stubGlobal("fetch", mockFetch());
    render(<VaultPanel />);
    await screen.findByText("My Gateway");
    expect(screen.getByTestId("custom-badge")).toBeInTheDocument();
    expect(screen.getByTestId("provider-edit-mygateway")).toBeInTheDocument();
    expect(screen.getByTestId("provider-remove-mygateway")).toBeInTheDocument();
    // OpenAI (packaged) has no edit/remove — the catalog is read-only there
    expect(screen.queryByTestId("provider-edit-openai")).toBeNull();
  });

  it("add button opens the dialog", async () => {
    vi.stubGlobal("fetch", mockFetch());
    render(<VaultPanel />);
    await userEvent.click(await screen.findByTestId("vault-add-provider"));
    expect(screen.getByTestId("vault-provider-dialog")).toBeInTheDocument();
  });
});
