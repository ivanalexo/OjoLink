import { PROTECTED_PACKS } from "../data/index.js";
import { createHomographSignal } from "./homograph.js";
import { invisibleCharacters } from "./invisible.js";
import { mixedScript } from "./mixed-script.js";
import { credentials, encodedHost, ipHost } from "./obfuscation.js";
import { createSubdomainSignal } from "./subdomain.js";
import type { Signal } from "./types.js";

export const DEFAULT_SIGNALS: readonly Signal[] = [
  createHomographSignal(PROTECTED_PACKS),
  createSubdomainSignal(PROTECTED_PACKS),
  mixedScript,
  invisibleCharacters,
  credentials,
  ipHost,
  encodedHost,
];
