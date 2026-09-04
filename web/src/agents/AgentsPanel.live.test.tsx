/*
 * N-R12 (user asks 1-4): per-provider rows gain two one-click actions —
 * "拉取最新模型" (live /models refresh, count shown) and "测试对话"
 * (3-second pong round-trip, honest ok/error result). The dialog's fields
 * each carry a plain-language explainer (Base URL / API Key demystified).
 * Custom-mode simplification: only name+key are required-looking; URL is
 * pre-annotated as optional-advanced.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AgentsPanel from "./AgentsPanel";
import { I18nProvider } from "../i18n";

const agents = [
  {
    id: "claude-code",
    display_name: "Claude Code",
    installed: true,
    evidence: { "exe:claude": true },
    config_paths: {},
    skills_dir: "~/.claude/skills",
    launch_command: ["claude"],
    env_config_support: false,
    tui: true,
  },
];

const catalog = [
  { id: "deepseek", display_name: "DeepSeek", base_url: "https://api.deepseek.com", models: ["deepseek-chat"], keyless: false, configured: true },
  { id: "anthropic", display_name: "Anthropic", base_url: "https://api.anthropic.com", models: ["claude-sonnet-4-5"], keyless: false, configured: false },
];

function makeFetch() {
  return vi.fn((url: string) => {
    const u = String(url);
    if (u === "/api/agents") return Promise.resolve({ json: () => Promise.resolve({ agents }) });
    if (u === "/api/agents/status") return Promise.resolve({ json: () => Promise.resolve({}) });
    if (u === "/api/agents/models") return Promise.resolve({ json: () => Promise.resolve({ models: {}, sources: {} }) });
    if (u === "/api/agents/profiles") return Promise.resolve({ json: () => Promise.resolve({ profiles: {} }) });
    if (u === "/api/agents/providers") return Promise.resolve({ json: () => Promise.resolve({ providers: catalog }) });
    if (u.endsWith("/models/refresh"))
      return Promise.resolve({ json: () => Promise.resolve({ ok: true, count: 2, models: ["new-a", "new-b"] }) });
    if (u.endsWith("/test"))
      return Promise.resolve({ json: () => Promise.resolve({ ok: true, reply: "pong", model: "new-a" }) });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("N-R12: live models + chat test + plain-language fields", () => {
  beforeEach(() => {
    localStorage.setItem("toondeck.lang", "zh");
    vi.stubGlobal("fetch", makeFetch());
  });

  it("refresh button pulls live models and shows the count", async () => {
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    await userEvent.click(await screen.findByTestId("provider-models-refresh-deepseek"));
    expect(await screen.findByTestId("provider-result-deepseek")).toHaveTextContent(/2/);
    const call = vi.mocked(fetch).mock.calls.find((c) => String(c[0]).endsWith("/models/refresh"));
    expect(call).toBeTruthy();
  });

  it("test button runs a chat round-trip and reports the reply", async () => {
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    await userEvent.click(await screen.findByTestId("provider-test-deepseek"));
    const result = await screen.findByTestId("provider-result-deepseek");
    await waitFor(() => expect(result.textContent).toMatch(/pong/));
  });

  it("enable dialog explains every field in plain language", async () => {
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    await userEvent.click(await screen.findByTestId("provider-enable-anthropic"));
    const dlg = await screen.findByRole("dialog");
    expect(dlg.textContent).toMatch(/钥匙|密码|通行证/); // key explained
    expect(dlg.textContent).toMatch(/接口地址|网址/); // base url explained
  });
});
