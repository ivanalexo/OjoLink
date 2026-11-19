export type Wrapper = "outlook-safelinks" | "google-redirect";

export interface UnwrapResult {
  readonly destination: string;
  readonly wrappers: readonly Wrapper[];
  readonly limitReached: boolean;
}

interface WrapperRule {
  readonly id: Wrapper;
  readonly matches: (url: URL) => boolean;
  readonly params: readonly string[];
}

export const MAX_WRAPPER_LAYERS = 5;

const SAFELINKS_HOST = "safelinks.protection.outlook.com";
const GOOGLE_HOSTS: readonly string[] = ["google.com", "www.google.com"];

const RULES: readonly WrapperRule[] = [
  {
    id: "outlook-safelinks",
    matches: (url) =>
      url.hostname === SAFELINKS_HOST || url.hostname.endsWith("." + SAFELINKS_HOST),
    params: ["url"],
  },
  {
    id: "google-redirect",
    matches: (url) => GOOGLE_HOSTS.includes(url.hostname) && url.pathname === "/url",
    params: ["q", "url"],
  },
];

function parseWebUrl(text: string): URL | null {
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function peel(url: URL): { id: Wrapper; destination: string } | null {
  const rule = RULES.find((candidate) => candidate.matches(url));
  if (!rule) return null;
  for (const param of rule.params) {
    const value = url.searchParams.get(param)?.trim();
    if (value && parseWebUrl(value)) return { id: rule.id, destination: value };
  }
  return null;
}

/** Replaces links rewritten by mail providers with the destination they carry, without any network access. */
export function unwrapUrl(input: string): UnwrapResult {
  let destination = input.trim();
  const wrappers: Wrapper[] = [];

  for (;;) {
    const url = parseWebUrl(destination);
    const inner = url ? peel(url) : null;
    if (!inner) return { destination, wrappers, limitReached: false };
    if (wrappers.length === MAX_WRAPPER_LAYERS) {
      return { destination, wrappers, limitReached: true };
    }
    wrappers.push(inner.id);
    destination = inner.destination;
  }
}
