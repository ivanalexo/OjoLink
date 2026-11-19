import { rawAuthority } from "./raw.js";
import type { Signal } from "./types.js";

const DOMAIN_SHAPE = /^[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+$/u;

function decode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function isPrivateIpv4(address: string): boolean {
  const [a = 0, b = 0] = address.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateIpv6(address: string): boolean {
  return (
    address === "::" || address === "::1" || /^f[cd]/.test(address) || /^fe[89ab]/.test(address)
  );
}

/** Triggers when a link carries a user name before the host, often a decoy that looks like a site. */
export const credentials: Signal = {
  id: "credentials",
  kind: "risk",
  variants: ["decoy", "plain"],
  evaluate(url) {
    if (url.schemeAssumed) return null;
    const { userInfo, host } = rawAuthority(url.destination);
    if (!userInfo) return null;

    const name = decode(userInfo.split(":")[0] ?? "");
    return {
      variant: DOMAIN_SHAPE.test(name) ? "decoy" : "plain",
      params: { decoy: name, realHost: url.host, written: `${name}@${host}` },
    };
  },
};

/** Triggers when the host is a numeric address, more strongly when its notation is disguised. */
export const ipHost: Signal = {
  id: "ip-host",
  kind: "risk",
  variants: ["encoded", "public"],
  evaluate(url) {
    if (!url.isIp) return null;
    const written = rawAuthority(url.destination).host.replace(/\.$/, "").toLowerCase();
    const params = { written, realHost: url.asciiHost };

    if (url.asciiHost.startsWith("[")) {
      return isPrivateIpv6(url.asciiHost.slice(1, -1)) ? null : { variant: "public", params };
    }
    if (written !== url.asciiHost) return { variant: "encoded", params };
    return isPrivateIpv4(url.asciiHost) ? null : { variant: "public", params };
  },
};

/** Triggers when the host is written with percent-encoding, which a domain name never needs. */
export const encodedHost: Signal = {
  id: "encoded-host",
  kind: "risk",
  evaluate(url) {
    const written = rawAuthority(url.destination).host;
    if (!written.includes("%")) return null;
    return { params: { written, realHost: url.host } };
  },
};
