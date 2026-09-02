import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @tailwindcss/vite exports an async plugin factory — resolve it before composing.
const tailwindPlugin = await tailwindcss();

export default defineConfig({
  plugins: [react(), tailwindPlugin],
  build: { outDir: "dist" },
  server: {
    proxy: { "/api": "http://127.0.0.1:8720" },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
