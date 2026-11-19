import { invisibleCharacters } from "./invisible.js";
import { mixedScript } from "./mixed-script.js";
import { credentials, encodedHost, ipHost } from "./obfuscation.js";
import type { Signal } from "./types.js";

export const DEFAULT_SIGNALS: readonly Signal[] = [
  mixedScript,
  invisibleCharacters,
  credentials,
  ipHost,
  encodedHost,
];
