/*
 * R47 — ServerTable: THE one server list. The old MCP page had four cards
 * talking past each other (lazy tool browser, discover grid, managed grid,
 * health rows) — a server could appear in three of them and an error could
 * hide in the fourth. Contract:
 * - every server (managed or just discovered in some config) = exactly one row
 * - managed/discovered badge is visible without expanding
 * - errors are inline, never buried
 * - health results fold into the same rows
 * - discovered rows offer one-click adoption
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import ServerTable, { buildRows, type ServerRow } from "./ServerTable";
import type { HealthResult, InventoryServer, ServerView } from "./api";

const managed: ServerView[] = [
  {
    name: "fetch",
    transport: "stdio",
    target: "npx -y mcp-fetch",
    env_keys: [],
    header_keys: [],
    disabled_tools: ["greet"],
    tool_total: 1,
    cache_age_s: null,
    sources: ["claude-desktop"],
  },
];

const inventory: InventoryServer[] = [
  {
    server: "fetch",
    status: "ok",
    latency_ms: 8,
    error: null,
    tools: [{ name: "greet", description: "say hi" }],
  },
  {
    server: "test",
    status: "error",
    latency_ms: 0,
    error: "[PROCESS_DIED] MCP server process exited.",
    tools: [],
  },
];

const health: HealthResult[] = [
  { server: "fetch", transport: "stdio", status: "timeout", tools: 1, latency_ms: 10_000, error: null },
];

function renderTable(rows: ServerRow[], onAdopt = vi.fn(), onToggle = vi.fn()) {
  return render(
    <I18nProvider>
      <ServerTable rows={rows} onToggle={onToggle} onAdopt={onAdopt} />
    </I18nProvider>,
  );
}

describe("ServerTable (R47)", () => {
  it("buildRows: managed + discovered union, health wins over inventory", () => {
    const rows = buildRows(managed, inventory, health);
    expect(rows.map((r) => r.name)).toEqual(["fetch", "test"]);
    const fetchRow = rows[0];
    expect(fetchRow.managed).toBe(true);
    expect(fetchRow.status).toBe("timeout"); // fresh health beats cached inventory
    const testRow = rows[1];
    expect(testRow.managed).toBe(false);
    expect(testRow.error).toMatch(/PROCESS_DIED/);
  });

  it("badges are visible without expanding; errors render inline", () => {
    const rows = buildRows(managed, inventory, null);
    renderTable(rows);
    expect(screen.getAllByText(/managed|已接管/).length).toBe(1);
    expect(screen.getAllByText(/discovered|待收编/).length).toBe(1);
    expect(screen.getByText(/PROCESS_DIED/)).toBeInTheDocument(); // never buried
  });

  it("expanding a discovered row offers adoption", async () => {
    const onAdopt = vi.fn();
    const rows = buildRows([], inventory, null);
    renderTable(rows, onAdopt);
    await userEvent.click(screen.getByText("test"));
    await userEvent.click(screen.getByTestId("server-adopt-test"));
    expect(onAdopt).toHaveBeenCalledWith("test");
  });

  it("expanding a managed row exposes disabled-tool toggles and tool pills", async () => {
    const onToggle = vi.fn();
    const rows = buildRows(managed, inventory, null);
    renderTable(rows, vi.fn(), onToggle);
    await userEvent.click(screen.getByText("fetch"));
    await userEvent.click(screen.getByRole("button", { name: /greet/ }));
    expect(onToggle).toHaveBeenCalledWith("fetch", "greet");
    // the healthy tool list shows the same tool as a pill too
    expect(screen.getByTitle("say hi")).toBeInTheDocument();
  });
});
