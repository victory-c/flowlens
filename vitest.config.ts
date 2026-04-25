import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/api/**/*.{test,spec}.ts", "tests/api/**/*.{test,spec}.tsx"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    globals: true
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname
    }
  }
});
