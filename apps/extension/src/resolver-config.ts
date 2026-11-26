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

/** A donation address, or null when the text is not an https address. */
export function parseDonate(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const url = new URL(value.trim());
    const plain = url.username === "" && url.password === "";
    return url.protocol === "https:" && plain ? url.href : null;
  } catch {
    return null;
  }
}

/** Reads the donation address from the build settings and fails the build on a bad one. */
export function donateAddress(value: string | undefined): string | null {
  if (value === undefined || value.trim() === "") return null;
  const address = parseDonate(value);
  if (address === null) throw new Error("WXT_DONATE_URL must be an https address.");
  return address;
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
