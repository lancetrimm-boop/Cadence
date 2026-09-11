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

export type ReferencePointId = "A1" | "A2" | "A3" | "B1" | "B2" | "B3";

export type ReferenceGroup = "A" | "B";

export type ReferencePoint = {
  id: ReferencePointId;
  group: ReferenceGroup;
  index: 1 | 2 | 3;
  label: string;
  /** Normalized X position in % (0 to 100) */
  x: number;
  /** Normalized Y position in % (0 to 100) */
  y: number;
  /** Whether point has been explicitly set/calibrated by the user */
  set: boolean;
};

export type CalibrationPresetId =
  | "vertical_center"
  | "wide_span"
  | "upper_focus"
  | "lower_focus"
  | "diagonal_right"
  | "diagonal_left";

export type CalibrationPreset = {
  id: CalibrationPresetId;
  name: string;
  description: string;
  points: Record<ReferencePointId, { x: number; y: number }>;
};

export type AbRegion = {
  startMs: number | null;
  endMs: number | null;
  confirmed: boolean;
};

export type ProjectWorkflowState =
  | "unloaded"
  | "media_loaded"
  | "reference_setup"
  | "phase2_complete"
  | "phase3_tracking"
  | "calibrated";

export type CalibrationVector = {
  centroidA: { x: number; y: number };
  centroidB: { x: number; y: number };
  travelSpanY: number; // in %
  totalDistance: number; // in %
  angleDeg: number; // angle in degrees from vertical
};

// ==========================================
// Phase 3: Optical Tracking Types
// ==========================================

export type TrackedPointStatus = "tracking" | "searching" | "unknown" | "lost";

export type PrimaryTrackedPointId = "Primary_A" | "Primary_B";

export type PrimaryTrackedPoint = {
  id: PrimaryTrackedPointId;
  label: string;
  status: TrackedPointStatus;
  /** Normalized X position in % (0 to 100), null if position cannot be determined */
  x: number | null;
  /** Normalized Y position in % (0 to 100), null if position cannot be determined */
  y: number | null;
  /** Confidence score between 0 and 1 (0% to 100%) */
  confidence: number;
  /** Reference anchor group used for baseline spatial localization */
  referenceGroup: "A" | "B";
  /** Associated reference point IDs from Phase 2 calibration */
  referencePointIds: readonly ["A1", "A2", "A3"] | readonly ["B1", "B2", "B3"];
  /** Centroid of associated reference points */
  referenceCentroid: { x: number; y: number };
  /** Displacement vector from reference centroid in % (null if unknown) */
  displacement: { dx: number; dy: number; dist: number } | null;
  /** Method used for optical feature localization */
  method: string;
};

export type OpticalTrackingFrame = {
  tMs: number;
  primaryA: PrimaryTrackedPoint;
  primaryB: PrimaryTrackedPoint;
  /** Calculated Euclidean distance between Primary Point A and Primary Point B in % (null if either is unknown) */
  distance: number | null;
  /** Calculated vertical travel span between Primary Point A and Primary Point B in % (null if either is unknown) */
  spanY: number | null;
  /** Calculated stroke angle between Primary Point A and Primary Point B in degrees (null if either is unknown) */
  angleDeg: number | null;
  /** Status of optical tracking engine for this frame */
  status: "active" | "searching" | "unavailable" | "inactive";
  /** Whether tracking is actively running */
  active: boolean;
  /** Frame confidence score: average of Primary A and Primary B if known, or 0 */
  overallConfidence: number;
};

export type OpticalTrackingSettings = {
  /** Master toggle for optical tracking engine */
  enabled: boolean;
  /** Minimum confidence threshold required to accept position (0 to 1). Below this, status is unknown */
  minConfidenceThreshold: number;
  /** Search radius around reference centroid in % of frame dimensions */
  searchRadiusPct: number;
  /** Show Primary Points A and B on the video canvas */
  showPrimaryOverlay: boolean;
  /** Show search window bounding boxes around reference centroids */
  showSearchBorders: boolean;
  /** Show displacement vector arrows from reference centroids to primary points */
  showDisplacementVectors: boolean;
};

