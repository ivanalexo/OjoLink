import { defineConfig } from "wxt";
import { buildManifest } from "./src/permissions.ts";
import { resolverOrigin } from "./src/resolver-config.ts";
import { strings } from "./src/strings.ts";

export default defineConfig({
  manifest: () => ({
    name: strings.name,
    description: strings.description,
    ...buildManifest(resolverOrigin(import.meta.env.WXT_RESOLVER_URL)),
    minimum_chrome_version: "116",
  }),
});
