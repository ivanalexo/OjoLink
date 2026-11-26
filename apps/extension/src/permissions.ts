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

const SCRIPT_POLICY = "script-src 'self'; object-src 'none'";

/** What the extension's own pages and background may load and contact. */
export function extensionPagesPolicy(resolver: string | null): string {
  return `${SCRIPT_POLICY}; connect-src ${resolver === null ? "'none'" : `'self' ${resolver}`}`;
}

export interface ManifestAccess {
  readonly permissions: string[];
  readonly host_permissions: string[];
  readonly optional_host_permissions: string[];
  readonly content_security_policy: { extension_pages: string };
}

/**
 * Everything the manifest declares about access. The resolver is the one outside address
 * the extension may contact; a package built without one declares none.
 */
export function buildManifest(resolver: string | null): ManifestAccess {
  return {
    permissions: Object.keys(PERMISSION_REASONS),
    host_permissions: [...REQUIRED_HOSTS, ...(resolver === null ? [] : [`${resolver}/*`])],
    optional_host_permissions: [...OPTIONAL_HOSTS],
    content_security_policy: { extension_pages: extensionPagesPolicy(resolver) },
  };
}
