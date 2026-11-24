import { defineConfig } from "wxt";
import {
  EXTENSION_PAGES_POLICY,
  OPTIONAL_HOSTS,
  PERMISSION_REASONS,
  REQUIRED_HOSTS,
} from "./src/permissions.ts";
import { strings } from "./src/strings.ts";

export default defineConfig({
  manifest: {
    name: strings.name,
    description: strings.description,
    permissions: Object.keys(PERMISSION_REASONS),
    host_permissions: [...REQUIRED_HOSTS],
    optional_host_permissions: [...OPTIONAL_HOSTS],
    content_security_policy: { extension_pages: EXTENSION_PAGES_POLICY },
    minimum_chrome_version: "116",
  },
});
