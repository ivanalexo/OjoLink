import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "wxt";
import { buildManifest } from "./src/permissions.ts";
import { donateAddress, resolverOrigin } from "./src/resolver-config.ts";
import { strings } from "./src/strings.ts";

export const BUILD_INFO = "build-info.json";

export default defineConfig({
  // The screenshot script builds its own copy elsewhere, so it never replaces the real package.
  ...(process.env.OJOLINK_OUT_DIR ? { outDir: process.env.OJOLINK_OUT_DIR } : {}),
  manifest: () => ({
    name: strings.name,
    description: strings.description,
    ...buildManifest(resolverOrigin(import.meta.env.WXT_RESOLVER_URL)),
    minimum_chrome_version: "116",
  }),
  zip: { artifactTemplate: "ojolink-{{version}}-{{browser}}.zip" },
  hooks: {
    // Beside the package, not inside it: the outside addresses this build was given.
    "build:done": (wxt) => {
      const info = {
        resolver: resolverOrigin(import.meta.env.WXT_RESOLVER_URL),
        donate: donateAddress(import.meta.env.WXT_DONATE_URL),
      };
      mkdirSync(wxt.config.outBaseDir, { recursive: true });
      writeFileSync(join(wxt.config.outBaseDir, BUILD_INFO), `${JSON.stringify(info, null, 2)}\n`);
    },
  },
});
