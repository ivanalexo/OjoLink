import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    // Tests must not depend on the resolver of whoever runs them.
    env: { WXT_RESOLVER_URL: "" },
  },
});
