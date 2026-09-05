import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @tailwindcss/vite exports an async plugin factory — resolve it before composing.
const tailwindPlugin = await tailwindcss();

const here = dirname(fileURLToPath(import.meta.url));
// CLEAN-ROOM AUDIT 2026-09-05: the SPA used to build into web/dist, which is
// gitignored AND outside the package, so an installed deck had no UI at all
// (every route 404'd). Build straight into the package instead — the wheel then
// carries its own frontend, and users need neither node nor a build step.
const packageWebui = resolve(here, "../src/toondeck/deck/api/webui");

/** Ship the hand-authored landing page alongside the SPA inside the package. */
const shipLanding = {
  name: "ship-landing",
  closeBundle() {
    const dest = resolve(packageWebui, "landing");
    mkdirSync(dest, { recursive: true });
    cpSync(resolve(here, "landing/index.html"), resolve(dest, "index.html"));
  },
};

export default defineConfig({
  plugins: [react(), tailwindPlugin, shipLanding],
  build: { outDir: packageWebui, emptyOutDir: true },
  server: {
    proxy: { "/api": "http://127.0.0.1:8720" },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
