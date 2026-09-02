import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const health = {
  ok: true,
  service: "toondeck",
  version: "0.1.0",
  engine: { available: true, version: "0.7.1" },
};

describe("App smoke", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: () => Promise.resolve(health) }));
  });

  it("renders the deck and shows engine status", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/toondeck/i);
    expect(await screen.findByText(/0\.7\.1/)).toBeInTheDocument();
  });
});
