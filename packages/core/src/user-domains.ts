import { PROTECTED_PACKS } from "./data/index.js";
import { normalizeUrl } from "./normalize.js";
import { buildProtectedIndex } from "./signals/protected-index.js";

export const USER_DOMAIN_LIMIT = 100;

export type UserDomainRejection =
  | "empty"
  | "not-a-domain"
  | "email-address"
  | "ip-address"
  | "public-suffix"
  | "already-protected"
  | "repeated"
  | "limit-reached";

export type UserDomainCheck =
  | { readonly ok: true; readonly domain: string }
  | { readonly ok: false; readonly reason: UserDomainRejection };

export type UserDomainEntry =
  | { readonly input: string; readonly accepted: true; readonly domain: string }
  | {
      readonly input: string;
      readonly accepted: false;
      readonly reason: UserDomainRejection;
      readonly domain?: string;
    };

export interface UserDomainReport {
  readonly domains: readonly string[];
  readonly entries: readonly UserDomainEntry[];
}

function reject(reason: UserDomainRejection): UserDomainCheck {
  return { ok: false, reason };
}

/** Reduces what a person typed to the registrable domain it would protect. Never throws. */
export function checkUserDomain(entry: unknown): UserDomainCheck {
  try {
    if (typeof entry !== "string") return reject("not-a-domain");
    if (entry.trim() === "") return reject("empty");

    const result = normalizeUrl(entry);
    if (!result.ok) {
      if (result.reason === "empty") return reject("empty");
      return reject(result.reason === "email-address" ? "email-address" : "not-a-domain");
    }

    const url = result.url;
    if (url.wrappers.length > 0) return reject("not-a-domain");
    if (url.isIp) return reject("ip-address");
    if (!url.suffixKnown) return reject("not-a-domain");
    if (url.registrableDomain === null) return reject("public-suffix");
    return { ok: true, domain: url.registrableDomain };
  } catch {
    return reject("not-a-domain");
  }
}

/**
 * Validates a list of user domains. Rejected entries carry a reason and do not affect the rest;
 * at most USER_DOMAIN_LIMIT domains are accepted. Never throws.
 */
export function prepareUserDomains(entries: unknown): UserDomainReport {
  const list: readonly unknown[] = Array.isArray(entries) ? entries : [];
  const embedded = buildProtectedIndex(PROTECTED_PACKS).domains;
  const domains: string[] = [];
  const seen = new Set<string>();

  const report = list.map((entry): UserDomainEntry => {
    const input = typeof entry === "string" ? entry : String(entry);
    const check = checkUserDomain(entry);
    if (!check.ok) return { input, accepted: false, reason: check.reason };

    const { domain } = check;
    const reason: UserDomainRejection | null = embedded.has(domain)
      ? "already-protected"
      : seen.has(domain)
        ? "repeated"
        : domains.length >= USER_DOMAIN_LIMIT
          ? "limit-reached"
          : null;
    if (reason) return { input, accepted: false, reason, domain };

    seen.add(domain);
    domains.push(domain);
    return { input, accepted: true, domain };
  });

  return { domains, entries: report };
}
