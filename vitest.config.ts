import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: [
      {
        find: "@buyer-v2/shared/",
        replacement: path.resolve(__dirname, "./packages/shared/src/"),
      },
      {
        find: "@buyer-v2/shared",
        replacement: path.resolve(__dirname, "./packages/shared/src/index.ts"),
      },
      {
        find: "@",
        replacement: path.resolve(__dirname, "./src"),
      },
      {
        find: "server-only",
        replacement: path.resolve(__dirname, "./src/test/server-only.ts"),
      },
    ],
  },
  test: {
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["**/node_modules/**", "**/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/lib/**/*.ts", "src/lib/**/*.tsx"],
      exclude: ["src/test/**", "src/__tests__/**"],
      thresholds: {
        statements: 50,
        branches: 50,
        functions: 50,
        lines: 50,
      },
    },
  },
});
