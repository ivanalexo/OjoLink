const META_TAG = /<meta\b[^>]{0,2048}>/gi;
const REFRESH = /http-equiv\s*=\s*(?:"refresh"|'refresh'|refresh(?=[\s/>]))/i;
const CONTENT = /content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const REFRESH_URL = /url\s*=\s*(.+)$/i;
const LOCATION = String.raw`(?<![\w$.])(?:(?:window|document|top|self|parent)\.)?location`;
const LITERAL = String.raw`(?:"([^"\n]{1,2048})"|'([^'\n]{1,2048})')`;
const ASSIGNED = new RegExp(
  String.raw`${LOCATION}(?:\.href)?\s*=\s*${LITERAL}(?=\s*(?:[;\n\r}<]|$))`,
);
const CALLED = new RegExp(String.raw`${LOCATION}\.(?:replace|assign)\(\s*${LITERAL}\s*\)`);

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };

function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#x([0-9a-f]{1,6})|#(\d{1,7})|([a-z]+));/gi,
    (match: string, hex?: string, dec?: string, name?: string) => {
      if (name) return ENTITIES[name.toLowerCase()] ?? match;
      const code = hex ? parseInt(hex, 16) : Number(dec);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    },
  );
}

function decodeScriptString(text: string): string {
  return text
    .replace(
      /\\u([0-9a-f]{4})|\\x([0-9a-f]{2})/gi,
      (_match: string, long?: string, short?: string) =>
        String.fromCharCode(parseInt(long ?? short ?? "0", 16)),
    )
    .replace(/\\(.)/g, "$1");
}

function metaRefresh(html: string): string | null {
  for (const [tag] of html.matchAll(META_TAG)) {
    if (!REFRESH.test(tag)) continue;
    const content = CONTENT.exec(tag);
    const value = content?.[1] ?? content?.[2] ?? content?.[3];
    if (value === undefined) continue;
    const target = REFRESH_URL.exec(decodeEntities(value))?.[1]?.trim();
    const bare = target?.replace(/^(["'])(.*)\1$/, "$2").trim();
    if (bare) return bare;
  }
  return null;
}

function scriptLocation(html: string): string | null {
  const match = ASSIGNED.exec(html) ?? CALLED.exec(html);
  const literal = match?.[1] ?? match?.[2];
  return literal ? decodeScriptString(literal).trim() || null : null;
}

/** Finds a redirect target written in a page, without running any of it. */
export function findRedirect(html: string): string | null {
  return metaRefresh(html) ?? scriptLocation(html);
}
