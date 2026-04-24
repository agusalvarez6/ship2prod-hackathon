import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(here, "src"),
    },
  },
  test: {
    environment: "node",
    pool: "threads",
    poolOptions: {
      threads: {
        // Tests that share the test Redis and Postgres must not run in parallel
        // across files. Same-file `describe` suites still run serially via
        // vitest's default semantics.
        singleThread: true,
      },
    },
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
