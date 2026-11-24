export interface Settings {
  /** Origin of the OjoLink resolver, or null when the app is built without one. */
  readonly resolver: string | null;
  /** Link to the published iOS Shortcut, or null when there is none. */
  readonly shortcut: string | null;
}

function parse(value: unknown): URL | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const url = new URL(value.trim());
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
    return url.username === "" && url.password === "" ? url : null;
  } catch {
    return null;
  }
}

/** Origin of a resolver address. Only https, or http on this machine, is accepted. */
export function parseOrigin(value: unknown): string | null {
  return parse(value)?.origin ?? null;
}

export function parseLink(value: unknown): string | null {
  return parse(value)?.href ?? null;
}

export function readSettings(env: Readonly<Record<string, unknown>>): Settings {
  return {
    resolver: parseOrigin(env.VITE_RESOLVER_URL),
    shortcut: parseLink(env.VITE_IOS_SHORTCUT_URL),
  };
}
