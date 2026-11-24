import { DEFAULT_SITES, hostOfPattern, toPattern } from "./sites.ts";

export const SCRIPT_PREFIX = "ojolink-site:";
/** Where the build puts the page script. A test checks the file is there. */
export const PAGE_SCRIPT = "content-scripts/content.js";

export interface PageScript {
  readonly id: string;
  readonly matches: readonly string[];
  readonly js: readonly string[];
  readonly runAt: "document_idle";
  readonly persistAcrossSessions: true;
}

export interface Plan {
  readonly register: readonly PageScript[];
  readonly unregister: readonly string[];
}

/** The browser calls the background needs, so tests can stand in for them. */
export interface SiteApi {
  grantedOrigins(): Promise<readonly string[]>;
  registeredIds(): Promise<readonly string[]>;
  register(scripts: readonly PageScript[]): Promise<void>;
  unregister(ids: readonly string[]): Promise<void>;
}

function scriptFor(host: string): PageScript {
  return {
    id: `${SCRIPT_PREFIX}${host}`,
    matches: [toPattern(host)],
    js: [PAGE_SCRIPT],
    runAt: "document_idle",
    persistAcrossSessions: true,
  };
}

/** The hosts the person granted, without the default sites, which the manifest covers. */
export function grantedHosts(origins: readonly string[]): string[] {
  const hosts = origins
    .map(hostOfPattern)
    .filter(
      (host): host is string =>
        host !== null && !(DEFAULT_SITES as readonly string[]).includes(host),
    );
  return [...new Set(hosts)].sort();
}

/** What to register and unregister so page scripts match the sites the browser says are granted. */
export function reconcile(origins: readonly string[], registeredIds: readonly string[]): Plan {
  const wanted = grantedHosts(origins).map(scriptFor);
  const wantedIds = new Set(wanted.map((script) => script.id));
  const ours = registeredIds.filter((id) => id.startsWith(SCRIPT_PREFIX));
  return {
    register: wanted.filter((script) => !ours.includes(script.id)),
    unregister: ours.filter((id) => !wantedIds.has(id)).sort(),
  };
}

/** Returns a function that brings registrations up to date, one run at a time. */
export function createSync(api: SiteApi): () => Promise<void> {
  let last: Promise<void> = Promise.resolve();
  const run = async (): Promise<void> => {
    const plan = reconcile(await api.grantedOrigins(), await api.registeredIds());
    if (plan.unregister.length > 0) await api.unregister(plan.unregister);
    if (plan.register.length > 0) await api.register(plan.register);
  };
  return () => {
    last = last.then(run, run);
    return last;
  };
}
