import { parseResolver } from "./resolver-config.ts";

export const HOVER_SETTING = "revealOnHover";

export interface Settings {
  /** The origin of the OjoLink resolver, or null when this package was built without one. */
  readonly resolver: string | null;
  /** Where the resolver publishes its privacy policy. */
  readonly privacyPolicy: string | null;
}

export function readSettings(env: Readonly<Record<string, unknown>>): Settings {
  const resolver = parseResolver(env.WXT_RESOLVER_URL);
  return { resolver, privacyPolicy: resolver === null ? null : `${resolver}/privacidad` };
}

export const settings: Settings = readSettings(import.meta.env);
