import { HOSTING_SERVICES, LURE_WORDS, PROTECTED_PACKS, SHORTENERS } from "../data/index.js";
import { createCombosquatSignal } from "./combosquat.js";
import { createHomographSignal } from "./homograph.js";
import { createHostingSignal } from "./hosting.js";
import { invisibleCharacters } from "./invisible.js";
import { createLinkMismatchSignal } from "./link-mismatch.js";
import { mixedScript } from "./mixed-script.js";
import { credentials, encodedHost, ipHost } from "./obfuscation.js";
import { createHiddenDestinationSignal } from "./shortener.js";
import { createSubdomainSignal } from "./subdomain.js";
import { createTyposquatSignal } from "./typosquat.js";
import type { Signal } from "./types.js";

/** The built-in signals in their fixed order, protecting the given user domains too. */
export function createDefaultSignals(userDomains?: readonly string[]): readonly Signal[] {
  const extra = userDomains && userDomains.length > 0 ? userDomains : undefined;
  const homograph = createHomographSignal(PROTECTED_PACKS, extra);
  const subdomain = createSubdomainSignal(PROTECTED_PACKS, extra);
  const typosquat = createTyposquatSignal(PROTECTED_PACKS, extra);
  const hosting = createHostingSignal(HOSTING_SERVICES, LURE_WORDS);
  const hidden = createHiddenDestinationSignal(SHORTENERS);
  return [
    homograph,
    subdomain,
    typosquat,
    createCombosquatSignal(PROTECTED_PACKS, LURE_WORDS, extra, {
      isHosted: (url) => hosting.match(url) !== null,
      others: [homograph, subdomain, typosquat],
    }),
    hosting,
    mixedScript,
    invisibleCharacters,
    createLinkMismatchSignal(PROTECTED_PACKS, SHORTENERS, extra, {
      isHidden: (url) => hidden.evaluate(url, {}) !== null,
    }),
    credentials,
    ipHost,
    encodedHost,
    hidden,
  ];
}

export const DEFAULT_SIGNALS: readonly Signal[] = createDefaultSignals();
