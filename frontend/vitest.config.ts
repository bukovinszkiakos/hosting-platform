import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Vitest runs the frontend unit tests (see docs/12 "Frontend Testing"). We rely on
// Vitest's built-in oxc transform rather than @vitejs/plugin-react to keep the
// dev-dependency footprint small; oxc handles the JSX in the component tests.
export default defineConfig({
  resolve: {
    // Mirror the "@/*" -> "./src/*" alias from tsconfig.json so tests import modules
    // the same way the app does.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // tsconfig uses jsx:"preserve" (required by Next); override it here so the oxc
  // transformer emits React's automatic JSX runtime for .tsx test files.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
