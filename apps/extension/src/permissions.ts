import { DEFAULT_PATTERNS } from "./sites.ts";

/** Every browser capability the extension declares, with the reason it needs it. */
export const PERMISSION_REASONS: Readonly<Record<string, string>> = {
  storage: "Remembers the person's settings on the device. Nothing is synced to a server.",
  scripting: "Runs the link check on a site the person grants, beyond the three default ones.",
};

export const REQUIRED_HOSTS: readonly string[] = DEFAULT_PATTERNS;

/**
 * Lets the person add one more site at a time. It grants nothing by itself: each site needs
 * the person's action and the browser's own prompt.
 */
export const OPTIONAL_HOSTS: readonly string[] = ["https://*/*"];

/** Capabilities the extension must never declare. */
export const EXCLUDED_PERMISSIONS: readonly string[] = [
  "tabs",
  "activeTab",
  "history",
  "cookies",
  "downloads",
  "webRequest",
  "webNavigation",
  "declarativeNetRequest",
  "browsingData",
  "management",
  "<all_urls>",
];

export const EXTENSION_PAGES_POLICY = "script-src 'self'; object-src 'none'";
