const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The origin of a resolver address, or null when the text is not an acceptable one. */
export function parseResolver(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.username !== "" || url.password !== "") return null;
  const local = url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname);
  return url.protocol === "https:" || local ? url.origin : null;
}

/** Reads the resolver address from the build settings and fails the build on a bad one. */
export function resolverOrigin(value: string | undefined): string | null {
  if (value === undefined || value.trim() === "") return null;
  const origin = parseResolver(value);
  if (origin === null) {
    throw new Error(
      "WXT_RESOLVER_URL must be an https address, or http on localhost, with no credentials.",
    );
  }
  return origin;
}
