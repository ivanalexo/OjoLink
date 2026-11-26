import { parseDonate, parseResolver } from "./resolver-config.ts";

export const HOVER_SETTING = "revealOnHover";

export interface Settings {
  /** The origin of the OjoLink resolver, or null when this package was built without one. */
  readonly resolver: string | null;
  /** Where the resolver publishes its privacy policy. */
  readonly privacyPolicy: string | null;
  /** Where to donate, or null when this package was built without a donation address. */
  readonly donate: string | null;
}

export function readSettings(env: Readonly<Record<string, unknown>>): Settings {
  const resolver = parseResolver(env.WXT_RESOLVER_URL);
  return {
    resolver,
    privacyPolicy: resolver === null ? null : `${resolver}/privacidad`,
    donate: parseDonate(env.WXT_DONATE_URL),
  };
}

export const settings: Settings = readSettings(import.meta.env);
