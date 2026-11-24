export const SHARE_ROUTE = "analizar";

const FIELDS = ["title", "text", "url"] as const;

export function isShareRoute(pathname: string): boolean {
  return pathname.replace(/\/+$/, "").endsWith(`/${SHARE_ROUTE}`);
}

/** Address of the app's start page, given the address of its share route. */
export function appRoot(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed.slice(0, trimmed.length - SHARE_ROUTE.length);
}

/**
 * Joins what another app shared (title, text, url) into one text, in that order.
 * A field already contained in an earlier one is left out.
 */
export function readShared(search: string): string {
  const params = new URLSearchParams(search);
  const parts: string[] = [];
  for (const field of FIELDS) {
    const value = (params.get(field) ?? "").trim();
    if (value !== "" && !parts.some((part) => part.includes(value))) parts.push(value);
  }
  return parts.join("\n");
}
