import { HOSTING_SERVICES, LURE_WORDS, PROTECTED_PACKS, SHORTENERS } from "../data/index.js";
import { createHomographSignal } from "./homograph.js";
import { createHostingSignal } from "./hosting.js";
import { invisibleCharacters } from "./invisible.js";
import { mixedScript } from "./mixed-script.js";
import { credentials, encodedHost, ipHost } from "./obfuscation.js";
import { createHiddenDestinationSignal } from "./shortener.js";
import { createSubdomainSignal } from "./subdomain.js";
import { createTyposquatSignal } from "./typosquat.js";
import type { Signal } from "./types.js";

/** The built-in signals in their fixed order, protecting the given user domains too. */
export function createDefaultSignals(userDomains?: readonly string[]): readonly Signal[] {
  const extra = userDomains && userDomains.length > 0 ? userDomains : undefined;
  return [
    createHomographSignal(PROTECTED_PACKS, extra),
    createSubdomainSignal(PROTECTED_PACKS, extra),
    createTyposquatSignal(PROTECTED_PACKS, extra),
    createHostingSignal(HOSTING_SERVICES, LURE_WORDS),
    mixedScript,
    invisibleCharacters,
    credentials,
    ipHost,
    encodedHost,
    createHiddenDestinationSignal(SHORTENERS),
  ];
}

export const DEFAULT_SIGNALS: readonly Signal[] = createDefaultSignals();
