import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    // Tests must not depend on the build settings of whoever runs them.
    env: { WXT_RESOLVER_URL: "", WXT_DONATE_URL: "" },
  },
});
