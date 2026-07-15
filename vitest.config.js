import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["tests_js/setup/dom.setup.js"],
    include: ["tests_js/**/*.test.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "reports/coverage/js",
      include: ["src/**/*.ts"],
      exclude: [
        "src/ui/**",
        "src/main.ts",
        "**/*.d.ts"
      ],
      thresholds: {
        lines: 70,
        functions: 65,
        statements: 70,
        branches: 50,
      },
    },
  },
});
