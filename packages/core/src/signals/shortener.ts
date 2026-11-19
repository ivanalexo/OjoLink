import { SHORTENERS, type Shortener, type ShortenerKind } from "../data/index.js";
import type { Signal } from "./types.js";

export type HiddenDestinationDetails = {
  readonly service: string;
  readonly kind: ShortenerKind;
  readonly link: string;
};

const cache = new WeakMap<readonly Shortener[], ReadonlyMap<string, ShortenerKind>>();

function kindsByHost(shorteners: readonly Shortener[]): ReadonlyMap<string, ShortenerKind> {
  let map = cache.get(shorteners);
  if (!map) {
    map = new Map(shorteners.map((entry) => [entry.host, entry.kind]));
    cache.set(shorteners, map);
  }
  return map;
}

/** Finds the listed shortener or tracker a host belongs to: the host itself or a parent domain. */
export function matchShortener(
  host: string,
  shorteners: readonly Shortener[] = SHORTENERS,
): Shortener | null {
  const kinds = kindsByHost(shorteners);
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  for (let start = 0; start < labels.length - 1; start++) {
    const candidate = labels.slice(start).join(".");
    const kind = kinds.get(candidate);
    if (kind) return { host: candidate, kind };
  }
  return null;
}

/** Builds the signal for links whose destination is concealed by a shortener or tracker. */
export function createHiddenDestinationSignal(shorteners: readonly Shortener[]): Signal {
  return {
    id: "hidden-destination",
    kind: "hidden-destination",
    variants: ["shortener", "tracker"],
    evaluate(url) {
      if (url.isIp) return null;
      const service = matchShortener(url.asciiHost, shorteners);
      if (!service) return null;

      const link = new URL(url.href);
      if (link.pathname === "/" && link.search === "") return null;

      const details: HiddenDestinationDetails = {
        service: service.host,
        kind: service.kind,
        link: url.href,
      };
      return { variant: service.kind, params: { service: service.host, link: url.href }, details };
    },
  };
}
