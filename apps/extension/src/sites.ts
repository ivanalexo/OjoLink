/** The webmail sites the extension runs on from the moment it is installed. */
export const DEFAULT_SITES = ["mail.google.com", "outlook.office.com", "outlook.live.com"] as const;

export type SiteRejection =
  "empty" | "wildcard" | "not-https" | "port" | "ip-address" | "not-a-host" | "default-site";

export type SiteCheck =
  | { readonly ok: true; readonly host: string; readonly pattern: string }
  | { readonly ok: false; readonly reason: SiteRejection };

const SCHEME = /^([a-z][a-z0-9+.-]*):\/\//i;
const HOST = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$/;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const PATTERN = /^https:\/\/([^/*:]+)\/\*$/;

export function toPattern(host: string): string {
  return `https://${host}/*`;
}

export const DEFAULT_PATTERNS: readonly string[] = DEFAULT_SITES.map(toPattern);

/** The host of a pattern that names one https site, or null for any other pattern. */
export function hostOfPattern(pattern: string): string | null {
  return PATTERN.exec(pattern)?.[1] ?? null;
}

/** Turns what a person typed into the pattern of one https site, or says why it cannot be. */
export function checkSite(input: string): SiteCheck {
  const text = input.trim();
  const reject = (reason: SiteRejection): SiteCheck => ({ ok: false, reason });
  if (text === "") return reject("empty");
  if (text.includes("*")) return reject("wildcard");

  const scheme = SCHEME.exec(text)?.[1]?.toLowerCase();
  if (scheme !== undefined && scheme !== "https") return reject("not-https");

  let url: URL;
  try {
    url = new URL(scheme === undefined ? `https://${text}` : text);
  } catch {
    return reject("not-a-host");
  }
  if (url.port !== "") return reject("port");
  if (url.username !== "" || url.password !== "") return reject("not-a-host");

  const host = url.hostname.toLowerCase();
  if (IPV4.test(host) || host.startsWith("[")) return reject("ip-address");
  if (!HOST.test(host)) return reject("not-a-host");
  if ((DEFAULT_SITES as readonly string[]).includes(host)) return reject("default-site");
  return { ok: true, host, pattern: toPattern(host) };
}
