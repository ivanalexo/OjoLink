import { prepareUserDomains, type UserDomainRejection } from "@ojolink/core";

export const USER_DOMAINS_KEY = "userDomains";

export type AddResult =
  | { readonly ok: true; readonly domains: readonly string[]; readonly domain: string }
  | { readonly ok: false; readonly reason: UserDomainRejection };

/**
 * The person's protected domains out of whatever storage returned. Nothing stored is trusted:
 * only text entries the engine accepts come out, reduced to their domain.
 */
export function readUserDomains(stored: unknown): readonly string[] {
  if (!Array.isArray(stored)) return [];
  return prepareUserDomains(stored.filter((entry) => typeof entry === "string")).domains;
}

/** Adds what the person typed, or says why the engine would not protect it. */
export function addUserDomain(list: readonly string[], entry: string): AddResult {
  const current = readUserDomains(list);
  const report = prepareUserDomains([...current, entry]);
  const last = report.entries.at(-1);
  if (!last || !last.accepted) return { ok: false, reason: last?.reason ?? "not-a-domain" };
  return { ok: true, domains: report.domains, domain: last.domain };
}

export function removeUserDomain(list: readonly string[], domain: string): readonly string[] {
  return readUserDomains(list).filter((item) => item !== domain);
}
