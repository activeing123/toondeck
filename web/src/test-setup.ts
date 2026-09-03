import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// R37: the dev-mode escape hatch lives in localStorage; a test that sets it
// must not leak into the next file (jsdom persists localStorage per worker).
afterEach(() => {
  localStorage.removeItem("toondeck.dev");
});

