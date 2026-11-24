export const VERSION = "0.0.0";

export { analyze, createDefaultEngine, createEngine } from "./analyze.js";
export type {
  AnalysisResult,
  AnalyzeOptions,
  DefaultEngine,
  DefaultEngineOptions,
  Engine,
  EngineConfig,
  NotAnalyzed,
  TriggeredSignal,
  Verdict,
} from "./analyze.js";
export { DEFAULT_CALIBRATION } from "./calibration.js";
export { describeResult } from "./describe.js";
export type {
  Comparison,
  ComparisonUnit,
  DescribeOptions,
  NotAnalyzedDescription,
  ResultDescription,
  TechnicalDetail,
  TechnicalSignal,
  VerdictDescription,
  WarningParts,
} from "./describe.js";
export { extractUrls } from "./extract.js";
export { HOSTING_SERVICES, LURE_WORDS, PROTECTED_PACKS, SHORTENERS } from "./data/index.js";
export type {
  HostingAssignment,
  HostingService,
  LureWord,
  ProtectedCategory,
  ProtectedEntry,
  ProtectedPack,
  ProtectedSuffix,
  Shortener,
  ShortenerKind,
} from "./data/index.js";
export type { Calibration, Thresholds } from "./calibration.js";
export { describeLevel, describeReveal, describeScript } from "./i18n/index.js";
export type {
  Catalogs,
  LevelMessage,
  Messages,
  PartialMessages,
  PresentationLabels,
  ReasonMessages,
  RevealTexts,
  SignalMessage,
  SignalText,
  Terms,
} from "./i18n/index.js";
export { normalizeUrl } from "./normalize.js";
export type { NormalizedUrl, NormalizeFailureReason, NormalizeResult } from "./normalize.js";
export type { Level } from "./score.js";
export { createDefaultSignals, DEFAULT_SIGNALS } from "./signals/index.js";
export { createCombosquatSignal } from "./signals/combosquat.js";
export type { CombosquatDetails } from "./signals/combosquat.js";
export { createHomographSignal } from "./signals/homograph.js";
export { createHostingSignal, findLureWords } from "./signals/hosting.js";
export type { HostedPage, HostingDetails } from "./signals/hosting.js";
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
export { checkUserDomain, prepareUserDomains, USER_DOMAIN_LIMIT } from "./user-domains.js";
export type {
  UserDomainCheck,
  UserDomainEntry,
  UserDomainRejection,
  UserDomainReport,
} from "./user-domains.js";
export type { UnwrapResult, Wrapper } from "./unwrap.js";
