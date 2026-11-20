import { matchShortener } from "@ojolink/core";
import { MAX_URL_LENGTH } from "./limits.ts";

export type RequestError = "invalid-request" | "host-not-allowed";

export type Validation = { ok: true; url: URL; deep: boolean } | { ok: false; error: RequestError };

export function isWeb(url: URL): boolean {
  return url.protocol === "http:" || url.protocol === "https:";
}

function isPlain(url: URL): boolean {
  return isWeb(url) && url.username === "" && url.password === "" && url.port === "";
}

/** The single rule for which URLs the resolver may send a request to. */
export function contactable(url: URL): boolean {
  return isPlain(url) && matchShortener(url.hostname) !== null;
}

export function parseUrl(text: string, base?: URL): URL | null {
  try {
    return new URL(text, base);
  } catch {
    return null;
  }
}

export function validateRequest(body: string): Validation {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return { ok: false, error: "invalid-request" };
  }
  const fields = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  const { url: text, deep = false } = fields;
  if (typeof text !== "string" || text.length > MAX_URL_LENGTH || typeof deep !== "boolean") {
    return { ok: false, error: "invalid-request" };
  }
  const url = parseUrl(text.trim());
  if (!url || !isPlain(url)) return { ok: false, error: "invalid-request" };
  if (!contactable(url)) return { ok: false, error: "host-not-allowed" };
  url.hash = "";
  return { ok: true, url, deep };
}
