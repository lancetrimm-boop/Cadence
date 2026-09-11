import { clamp } from "./format.ts";
import type {
  CalibrationPreset,
  CalibrationPresetId,
  CalibrationVector,
  ReferencePoint,
  ReferencePointId,
} from "./types.ts";

export const POINT_IDS: ReferencePointId[] = ["A1", "A2", "A3", "B1", "B2", "B3"];

export const GROUP_A_IDS: ReferencePointId[] = ["A1", "A2", "A3"];
export const GROUP_B_IDS: ReferencePointId[] = ["B1", "B2", "B3"];

export const POINT_METADATA: Record<
  ReferencePointId,
  { label: string; description: string; group: "A" | "B"; index: 1 | 2 | 3 }
> = {
  A1: { label: "A1 Upper-Left", description: "Top limit left anchor", group: "A", index: 1 },
  A2: { label: "A2 Upper-Crest", description: "Top limit center apex", group: "A", index: 2 },
  A3: { label: "A3 Upper-Right", description: "Top limit right anchor", group: "A", index: 3 },
  B1: { label: "B1 Lower-Left", description: "Bottom limit left anchor", group: "B", index: 1 },
  B2: { label: "B2 Lower-Trough", description: "Bottom limit center nadir", group: "B", index: 2 },
  B3: { label: "B3 Lower-Right", description: "Bottom limit right anchor", group: "B", index: 3 },
};

/**
 * Geometric calibration presets.
 * Note: These are pure geometric starting configurations without automated AI estimation.
 */
export const CALIBRATION_PRESETS: Record<CalibrationPresetId, CalibrationPreset> = {
  vertical_center: {
    id: "vertical_center",
    name: "Vertical Center (Standard)",
    description: "Symmetric vertical stroke aligned to the frame center.",
    points: {
      A1: { x: 44, y: 25 },
      A2: { x: 50, y: 20 },
      A3: { x: 56, y: 25 },
      B1: { x: 44, y: 75 },
      B2: { x: 50, y: 80 },
      B3: { x: 56, y: 75 },
    },
  },
  wide_span: {
    id: "wide_span",
    name: "Wide Span (Full Range)",
    description: "Extended amplitude spanning 80% vertical travel.",
    points: {
      A1: { x: 36, y: 16 },
      A2: { x: 50, y: 10 },
      A3: { x: 64, y: 16 },
      B1: { x: 36, y: 84 },
      B2: { x: 50, y: 90 },
      B3: { x: 64, y: 84 },
    },
  },
  upper_focus: {
    id: "upper_focus",
    name: "Upper Focus (Short Stroke)",
    description: "Confined to the upper quadrant of the frame.",
    points: {
      A1: { x: 44, y: 18 },
      A2: { x: 50, y: 12 },
      A3: { x: 56, y: 18 },
      B1: { x: 44, y: 48 },
      B2: { x: 50, y: 54 },
      B3: { x: 56, y: 48 },
    },
  },
  lower_focus: {
    id: "lower_focus",
    name: "Lower Focus (Deep Stroke)",
    description: "Confined to the lower quadrant of the frame.",
    points: {
      A1: { x: 44, y: 50 },
      A2: { x: 50, y: 44 },
      A3: { x: 56, y: 50 },
      B1: { x: 44, y: 82 },
      B2: { x: 50, y: 88 },
      B3: { x: 56, y: 82 },
    },
  },
  diagonal_right: {
    id: "diagonal_right",
    name: "Diagonal Angled (Right Tilt)",
    description: "Angled stroke axis tilted along the positive diagonal.",
    points: {
      A1: { x: 36, y: 25 },
      A2: { x: 42, y: 20 },
      A3: { x: 48, y: 25 },
      B1: { x: 52, y: 75 },
      B2: { x: 58, y: 80 },
      B3: { x: 64, y: 75 },
    },
  },
  diagonal_left: {
    id: "diagonal_left",
    name: "Diagonal Angled (Left Tilt)",
    description: "Angled stroke axis tilted along the negative diagonal.",
    points: {
      A1: { x: 52, y: 25 },
      A2: { x: 58, y: 20 },
      A3: { x: 64, y: 25 },
      B1: { x: 36, y: 75 },
      B2: { x: 42, y: 80 },
      B3: { x: 48, y: 75 },
    },
  },
};

export const PRESET_LIST = Object.values(CALIBRATION_PRESETS);

/**
 * Creates a reference point set where no points have been established yet.
 * Requirement: Do not automatically create A1-A3 or B1-B3 coordinates upon video load.
 */
export function createUnsetPoints(): Record<ReferencePointId, ReferencePoint> {
  const points = {} as Record<ReferencePointId, ReferencePoint>;
  for (const id of POINT_IDS) {
    const meta = POINT_METADATA[id];
    points[id] = {
      id,
      group: meta.group,
      index: meta.index,
      label: meta.label,
      x: 50,
      y: meta.group === "A" ? 25 : 75,
      set: false,
    };
  }
  return points;
}

/**
 * Creates a preset reference point set (A1-A3, B1-B3).
 */
export function createDefaultPoints(): Record<ReferencePointId, ReferencePoint> {
  const preset = CALIBRATION_PRESETS.vertical_center;
  const points = {} as Record<ReferencePointId, ReferencePoint>;
  for (const id of POINT_IDS) {
    const meta = POINT_METADATA[id];
    const coords = preset.points[id];
    points[id] = {
      id,
      group: meta.group,
      index: meta.index,
      label: meta.label,
      x: coords.x,
      y: coords.y,
      set: true, // Preset coordinates are populated
    };
  }
  return points;
}

/**
 * Counts how many of the 6 required reference points have been established.
 */
export function countCalibratedPoints(points: Record<ReferencePointId, ReferencePoint>): number {
  return POINT_IDS.filter((id) => points[id]?.set).length;
}

/**
 * Checks if all required points A1..A3 and B1..B3 are calibrated.
 */
export function areAllPointsCalibrated(points: Record<ReferencePointId, ReferencePoint>): boolean {
  for (const id of POINT_IDS) {
    const p = points[id];
    if (!p || !p.set) return false;
    if (typeof p.x !== "number" || typeof p.y !== "number") return false;
    if (isNaN(p.x) || isNaN(p.y)) return false;
  }
  return true;
}

/**
 * Computes the 2D centroid of a list of points.
 */
export function computeCentroid(pts: ReferencePoint[]): { x: number; y: number } {
  if (pts.length === 0) return { x: 50, y: 50 };
  const sumX = pts.reduce((acc, p) => acc + p.x, 0);
  const sumY = pts.reduce((acc, p) => acc + p.y, 0);
  return {
    x: Math.round((sumX / pts.length) * 10) / 10,
    y: Math.round((sumY / pts.length) * 10) / 10,
  };
}

/**
 * Computes stroke vector statistics from calibrated reference points.
 */
export function computeCalibrationVector(
  points: Record<ReferencePointId, ReferencePoint>,
): CalibrationVector {
  const groupA = GROUP_A_IDS.map((id) => points[id]).filter(Boolean);
  const groupB = GROUP_B_IDS.map((id) => points[id]).filter(Boolean);

  const centroidA = computeCentroid(groupA);
  const centroidB = computeCentroid(groupB);

  const dx = centroidB.x - centroidA.x;
  const dy = centroidB.y - centroidA.y;

  const totalDistance = Math.round(Math.hypot(dx, dy) * 10) / 10;
  const travelSpanY = Math.round(Math.abs(dy) * 10) / 10;

  // Angle in degrees from pure vertical (0° = straight down)
  const angleRad = Math.atan2(dx, dy);
  const angleDeg = Math.round(((angleRad * 180) / Math.PI) * 10) / 10;

  return {
    centroidA,
    centroidB,
    travelSpanY,
    totalDistance,
    angleDeg,
  };
}

/**
 * Clamps coordinates within 0 to 100%.
 */
export function sanitizeCoord(val: number): number {
  return clamp(Math.round(val * 10) / 10, 0, 100);
}
