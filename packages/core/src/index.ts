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
export type { Calibration, Thresholds } from "./calibration.js";
export type {
  Catalogs,
  LevelMessage,
  Messages,
  PartialMessages,
  SignalMessage,
  SignalText,
} from "./i18n/index.js";
export { normalizeUrl } from "./normalize.js";
export type { NormalizedUrl, NormalizeFailureReason, NormalizeResult } from "./normalize.js";
export type { Level } from "./score.js";
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
