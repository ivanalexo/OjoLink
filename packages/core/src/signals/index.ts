import { PROTECTED_PACKS, SHORTENERS } from "../data/index.js";
import { createHomographSignal } from "./homograph.js";
import { invisibleCharacters } from "./invisible.js";
import { mixedScript } from "./mixed-script.js";
import { credentials, encodedHost, ipHost } from "./obfuscation.js";
import { createHiddenDestinationSignal } from "./shortener.js";
import { createSubdomainSignal } from "./subdomain.js";
import { createTyposquatSignal } from "./typosquat.js";
import type { Signal } from "./types.js";

export const DEFAULT_SIGNALS: readonly Signal[] = [
  createHomographSignal(PROTECTED_PACKS),
  createSubdomainSignal(PROTECTED_PACKS),
  createTyposquatSignal(PROTECTED_PACKS),
  mixedScript,
  invisibleCharacters,
  credentials,
  ipHost,
  encodedHost,
  createHiddenDestinationSignal(SHORTENERS),
];
