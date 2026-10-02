import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["packages/*/test/**/*.test.ts"],
    exclude: ["packages/*/test/browser/**"],
    retry: 0,
  },
});
