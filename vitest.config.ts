import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["src/features/**/*.test.ts", "tests/integration/**/*.test.ts"],
    exclude: ["node_modules/**"],
    sequence: {
      concurrent: false,
    },
    fileParallelism: false,
  },
});
