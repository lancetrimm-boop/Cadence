export type Action = {
  id: string;
  at: number;
  pos: number;
};

export type MotionSample = {
  t: number;
  /** Subject vertical position, 0 = low, 1 = high. */
  pos: number;
  /** Local motion energy, 0–1. */
  energy: number;
  /** Estimated camera translation magnitude, 0–1. */
  camera: number;
  /** Residual after removing global flow, 0–1. */
  local: number;
  /** Scene-cut score, 0–1. */
  cut: number;
};

export type FlagKind =
  | "cut"
  | "camera"
  | "uncertain"
  | "inactive"
  | "unusual";

export type ReviewFlag = {
  id: string;
  kind: FlagKind;
  t: number;
  duration: number;
  label: string;
  detail: string;
};

export type StyleId = "signature" | "mechanical" | "soft" | "dense";

export type StylePreset = {
  id: StyleId;
  name: string;
  blurb: string;
  minPos: number;
  maxPos: number;
  /** Extra shape points on the way up (slower commit). */
  upPoints: number;
  /** Extra shape points on the way down (faster commit). */
  downPoints: number;
  /** 0–1, drop minor peaks for organic cadence. */
  cadenceSkip: number;
  /** Energy below this becomes a hold. */
  pauseThreshold: number;
  /** Minimum hold length in ms. */
  minHoldMs: number;
  /** Peak prominence 0–1. */
  prominence: number;
  smoothing: number;
};

export type ScriptStats = {
  actions: number;
  strokes: number;
  durationMs: number;
  densityPerMin: number;
  meanAmplitude: number;
  medianStrokeMs: number;
  upDownRatio: number;
  upperShare: number;
  lowerShare: number;
  holdCount: number;
  rangeUsed: number;
};

export type SourceKind = "demo" | "video" | "script";

export type ProjectMeta = {
  title: string;
  sourceKind: SourceKind;
  sourceName: string;
  durationMs: number;
};

export type FunscriptFile = {
  version?: string;
  inverted?: boolean;
  range?: number;
  metadata?: {
    creator?: string;
    title?: string;
    description?: string;
    duration?: number;
    license?: string;
    notes?: string;
  };
  actions: Array<{ at: number; pos: number }>;
};
