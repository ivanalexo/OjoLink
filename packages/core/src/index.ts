export const VERSION = "0.0.0";

export { analyze, createEngine } from "./analyze.js";
export type {
  AnalysisResult,
  AnalyzeOptions,
  Engine,
  EngineConfig,
  NotAnalyzed,
  TriggeredSignal,
  Verdict,
} from "./analyze.js";
export { DEFAULT_CALIBRATION } from "./calibration.js";
export { SHORTENERS } from "./data/index.js";
export type {
  ProtectedCategory,
  ProtectedEntry,
  ProtectedPack,
  ProtectedSuffix,
  Shortener,
  ShortenerKind,
} from "./data/index.js";
export type { Calibration, Thresholds } from "./calibration.js";
export { describeScript } from "./i18n/index.js";
export type {
  Catalogs,
  LevelMessage,
  Messages,
  PartialMessages,
  SignalMessage,
  SignalText,
  Terms,
} from "./i18n/index.js";
export { normalizeUrl } from "./normalize.js";
export type { NormalizedUrl, NormalizeFailureReason, NormalizeResult } from "./normalize.js";
export type { Level } from "./score.js";
export { createHomographSignal } from "./signals/homograph.js";
export type { HomographCharacter, HomographDetails } from "./signals/homograph.js";
export { createHiddenDestinationSignal, matchShortener } from "./signals/shortener.js";
export type { HiddenDestinationDetails } from "./signals/shortener.js";
export { createSubdomainSignal } from "./signals/subdomain.js";
export { createTyposquatSignal } from "./signals/typosquat.js";
export type { TyposquatDetails, TyposquatKind } from "./signals/typosquat.js";
export type { SubdomainCase, SubdomainDetails } from "./signals/subdomain.js";
export type {
  InvisibleCharacter,
  InvisibleCharacterKind,
  InvisibleCharacterLocation,
  InvisibleCharactersDetails,
} from "./signals/invisible.js";
export type { MixedLabel, MixedScriptDetails, ScriptCharacter } from "./signals/mixed-script.js";
export type {
  AnalysisContext,
  Signal,
  SignalDetails,
  SignalHit,
  SignalKind,
  SignalParams,
} from "./signals/types.js";
export { unwrapUrl } from "./unwrap.js";
export type { UnwrapResult, Wrapper } from "./unwrap.js";
