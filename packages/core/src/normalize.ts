import { parse } from "tldts";
import { decodeLabel } from "./punycode.js";
import { unwrapUrl, type Wrapper } from "./unwrap.js";

export interface NormalizedUrl {
  readonly input: string;
  readonly destination: string;
  readonly href: string;
  readonly scheme: "http" | "https";
  readonly schemeAssumed: boolean;
  readonly host: string;
  readonly asciiHost: string;
  readonly labels: readonly string[];
  readonly registrableDomain: string | null;
  readonly publicSuffix: string | null;
  readonly subdomainLabels: readonly string[];
  readonly suffixKnown: boolean;
  readonly isIp: boolean;
  readonly wrappers: readonly Wrapper[];
  readonly wrapperLimitReached: boolean;
}

export type NormalizeFailureReason = "empty" | "not-a-link" | "unsupported-scheme";

export type NormalizeResult =
  | { readonly ok: true; readonly url: NormalizedUrl }
  | { readonly ok: false; readonly reason: NormalizeFailureReason };

const WEB_SCHEME = /^https?:\/\//i;
const SCHEME_PREFIX = /^[a-z][a-z0-9+.-]*:/i;
const PORT_AFTER_COLON = /^\d{1,5}(?:[/?#]|$)/;

function classifyScheme(text: string): "web" | "none" | "not-a-link" | "unsupported-scheme" {
  if (WEB_SCHEME.test(text)) return "web";
  const prefix = SCHEME_PREFIX.exec(text);
  if (!prefix) return "none";
  if (PORT_AFTER_COLON.test(text.slice(prefix[0].length))) return "none";
  return /\s/.test(text) ? "not-a-link" : "unsupported-scheme";
}

function toUnicode(asciiDomain: string | null): string | null {
  return asciiDomain === null ? null : asciiDomain.split(".").map(decodeLabel).join(".");
}

function fail(reason: NormalizeFailureReason): NormalizeResult {
  return { ok: false, reason };
}

/** Turns a link into the comparable form every signal reads. Never throws and never touches the network. */
export function normalizeUrl(input: string): NormalizeResult {
  const trimmed = input.trim();
  if (trimmed === "") return fail("empty");

  const kind = classifyScheme(trimmed);
  if (kind === "not-a-link" || kind === "unsupported-scheme") return fail(kind);

  const candidate = kind === "none" ? `https://${trimmed}` : trimmed;
  const unwrapped = unwrapUrl(candidate);
  const wasWrapped = unwrapped.wrappers.length > 0;
  const schemeAssumed = kind === "none" && !wasWrapped;

  let parsed: URL;
  try {
    parsed = new URL(wasWrapped ? unwrapped.destination : candidate);
  } catch {
    return fail("not-a-link");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return fail("not-a-link");

  if (parsed.hostname.endsWith(".")) parsed.hostname = parsed.hostname.slice(0, -1);
  const asciiHost = parsed.hostname;
  if (asciiHost === "" || asciiHost.endsWith(".")) return fail("not-a-link");

  const info = parse(asciiHost.replace(/^\[|\]$/g, ""), {
    allowPrivateDomains: true,
    extractHostname: false,
  });
  const isIp = info.isIp === true;
  const suffixKnown = info.isIcann === true || info.isPrivate === true;
  if (schemeAssumed && !isIp && !suffixKnown) return fail("not-a-link");

  const labels = isIp ? [] : asciiHost.split(".").map(decodeLabel);
  const registrableDomain = isIp ? null : toUnicode(info.domain);
  const registrableLabelCount =
    registrableDomain === null ? labels.length : registrableDomain.split(".").length;

  return {
    ok: true,
    url: {
      input,
      destination: wasWrapped ? unwrapped.destination : trimmed,
      href: parsed.href,
      scheme: parsed.protocol === "http:" ? "http" : "https",
      schemeAssumed,
      host: isIp ? asciiHost : labels.join("."),
      asciiHost,
      labels,
      registrableDomain,
      publicSuffix: isIp ? null : toUnicode(info.publicSuffix),
      subdomainLabels: labels.slice(0, labels.length - registrableLabelCount),
      suffixKnown,
      isIp,
      wrappers: unwrapped.wrappers,
      wrapperLimitReached: unwrapped.limitReached,
    },
  };
}
