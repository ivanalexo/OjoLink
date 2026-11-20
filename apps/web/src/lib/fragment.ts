const PREFIX = "u=";

/** Reads a link passed as `#u=<encoded link>`. Returns null when absent or malformed. */
export function readFragmentLink(hash: string): string | null {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!fragment.startsWith(PREFIX)) return null;
  try {
    const link = decodeURIComponent(fragment.slice(PREFIX.length)).trim();
    return link === "" ? null : link;
  } catch {
    return null;
  }
}
