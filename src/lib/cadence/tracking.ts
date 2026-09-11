import { demoPoseAt } from "./demo.ts";
import { clamp } from "./format.ts";
import { computeCentroid } from "./calibration.ts";
import type {
  OpticalTrackingFrame,
  OpticalTrackingSettings,
  PrimaryTrackedPoint,
  ReferencePoint,
  ReferencePointId,
} from "./types.ts";

export const DEFAULT_TRACKING_SETTINGS: OpticalTrackingSettings = {
  enabled: false,
  minConfidenceThreshold: 0.4,
  searchRadiusPct: 14,
  showPrimaryOverlay: true,
  showSearchBorders: true,
  showDisplacementVectors: true,
};

/**
 * Creates an empty/unknown Primary Tracked Point anchored to a specific reference group.
 * Strictly adheres to rule: if positions cannot be determined, coordinates must be null and status unknown.
 */
export function createUnknownTrackedPoint(
  id: "Primary_A" | "Primary_B",
  referencePoints: Record<ReferencePointId, ReferencePoint>,
): PrimaryTrackedPoint {
  const isA = id === "Primary_A";
  const refIds = isA ? (["A1", "A2", "A3"] as const) : (["B1", "B2", "B3"] as const);
  const pts = refIds.map((rid) => referencePoints[rid]).filter(Boolean);
  const centroid = computeCentroid(pts);

  return {
    id,
    label: isA ? "Primary Point A" : "Primary Point B",
    status: "unknown",
    x: null,
    y: null,
    confidence: 0,
    referenceGroup: isA ? "A" : "B",
    referencePointIds: refIds,
    referenceCentroid: centroid,
    displacement: null,
    method: "optical_feature_gradient",
  };
}

/**
 * Creates an inactive tracking frame (tracking disabled or uncalibrated).
 */
export function createInactiveFrame(
  tMs: number,
  referencePoints: Record<ReferencePointId, ReferencePoint>,
): OpticalTrackingFrame {
  return {
    tMs,
    primaryA: createUnknownTrackedPoint("Primary_A", referencePoints),
    primaryB: createUnknownTrackedPoint("Primary_B", referencePoints),
    distance: null,
    spanY: null,
    angleDeg: null,
    status: "inactive",
    active: false,
    overallConfidence: 0,
  };
}

/**
 * Computes vector metrics between Primary Point A and Primary Point B.
 * If either point is unknown, metrics return null.
 */
export function computePrimaryGeometry(
  primaryA: PrimaryTrackedPoint,
  primaryB: PrimaryTrackedPoint,
): { distance: number | null; spanY: number | null; angleDeg: number | null } {
  if (
    primaryA.x === null ||
    primaryA.y === null ||
    primaryB.x === null ||
    primaryB.y === null
  ) {
    return { distance: null, spanY: null, angleDeg: null };
  }

  const dx = primaryB.x - primaryA.x;
  const dy = primaryB.y - primaryA.y;

  const distance = Math.round(Math.hypot(dx, dy) * 10) / 10;
  const spanY = Math.round(Math.abs(dy) * 10) / 10;
  const angleRad = Math.atan2(dx, dy);
  const angleDeg = Math.round(((angleRad * 180) / Math.PI) * 10) / 10;

  return { distance, spanY, angleDeg };
}

/**
 * Computes displacement vector between tracked point and its reference centroid.
 */
export function computeDisplacement(
  x: number | null,
  y: number | null,
  centroid: { x: number; y: number },
): { dx: number; dy: number; dist: number } | null {
  if (x === null || y === null) return null;
  const dx = Math.round((x - centroid.x) * 10) / 10;
  const dy = Math.round((y - centroid.y) * 10) / 10;
  const dist = Math.round(Math.hypot(dx, dy) * 10) / 10;
  return { dx, dy, dist };
}

// Reuse offscreen canvas for real video optical sampling
let offscreenCanvas: HTMLCanvasElement | null = null;
let offscreenCtx: CanvasRenderingContext2D | null = null;

function getOffscreenContext(w = 160, h = 90): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!offscreenCanvas) {
    offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = w;
    offscreenCanvas.height = h;
    offscreenCtx = offscreenCanvas.getContext("2d", { willReadFrequently: true });
  }
  return offscreenCtx;
}

/**
 * Optical tracking algorithm for real video frames:
 * Samples pixel luminance and spatial gradients in the Region of Interest (ROI)
 * anchored around Reference Centroid A and Reference Centroid B.
 * If contrast is low or confidence < threshold, returns unknown.
 */
export function trackFrameFromVideo(
  video: HTMLVideoElement,
  tMs: number,
  referencePoints: Record<ReferencePointId, ReferencePoint>,
  settings: OpticalTrackingSettings,
): OpticalTrackingFrame {
  // Check video readiness
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    return {
      tMs,
      primaryA: createUnknownTrackedPoint("Primary_A", referencePoints),
      primaryB: createUnknownTrackedPoint("Primary_B", referencePoints),
      distance: null,
      spanY: null,
      angleDeg: null,
      status: "unavailable",
      active: settings.enabled,
      overallConfidence: 0,
    };
  }

  const W = 160;
  const H = 90;
  const ctx = getOffscreenContext(W, H);
  if (!ctx) {
    return createInactiveFrame(tMs, referencePoints);
  }

  try {
    ctx.drawImage(video, 0, 0, W, H);
    const frameData = ctx.getImageData(0, 0, W, H).data;

    // Centroids of Reference Group A and Group B
    const ptsA = ["A1", "A2", "A3"].map((id) => referencePoints[id as ReferencePointId]).filter(Boolean);
    const ptsB = ["B1", "B2", "B3"].map((id) => referencePoints[id as ReferencePointId]).filter(Boolean);
    const centroidA = computeCentroid(ptsA);
    const centroidB = computeCentroid(ptsB);

    // Track Primary A around Centroid A
    const primaryA = trackFeatureInRoi(
      frameData,
      W,
      H,
      centroidA,
      "Primary_A",
      referencePoints,
      settings,
    );

    // Track Primary B around Centroid B
    const primaryB = trackFeatureInRoi(
      frameData,
      W,
      H,
      centroidB,
      "Primary_B",
      referencePoints,
      settings,
    );

    const geo = computePrimaryGeometry(primaryA, primaryB);
    const hasAnyTracked = primaryA.status === "tracking" || primaryB.status === "tracking";
    const overallConfidence = Math.round(((primaryA.confidence + primaryB.confidence) / 2) * 100) / 100;

    return {
      tMs,
      primaryA,
      primaryB,
      distance: geo.distance,
      spanY: geo.spanY,
      angleDeg: geo.angleDeg,
      status: hasAnyTracked ? "active" : "searching",
      active: settings.enabled,
      overallConfidence,
    };
  } catch {
    // If canvas cross-origin security or read error occurs, cleanly fall back to unknown
    return {
      tMs,
      primaryA: createUnknownTrackedPoint("Primary_A", referencePoints),
      primaryB: createUnknownTrackedPoint("Primary_B", referencePoints),
      distance: null,
      spanY: null,
      angleDeg: null,
      status: "unavailable",
      active: settings.enabled,
      overallConfidence: 0,
    };
  }
}

/**
 * Evaluates pixel gradients and luminance in a localized search window around a reference centroid.
 */
function trackFeatureInRoi(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  centroid: { x: number; y: number },
  id: "Primary_A" | "Primary_B",
  referencePoints: Record<ReferencePointId, ReferencePoint>,
  settings: OpticalTrackingSettings,
): PrimaryTrackedPoint {
  const isA = id === "Primary_A";
  const refIds = isA ? (["A1", "A2", "A3"] as const) : (["B1", "B2", "B3"] as const);

  // Search bounding box in pixel space
  const rx = Math.round((settings.searchRadiusPct / 100) * width);
  const ry = Math.round((settings.searchRadiusPct / 100) * height);
  const cx = Math.round((centroid.x / 100) * width);
  const cy = Math.round((centroid.y / 100) * height);

  const xMin = Math.max(1, cx - rx);
  const xMax = Math.min(width - 2, cx + rx);
  const yMin = Math.max(1, cy - ry);
  const yMax = Math.min(height - 2, cy + ry);

  let maxGrad = 0;
  let bestPx = cx;
  let bestPy = cy;
  let sumGrad = 0;
  let sumX = 0;
  let sumY = 0;
  let pixelCount = 0;

  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      const idx = (y * width + x) * 4;
      const lum = data[idx]! * 0.299 + data[idx + 1]! * 0.587 + data[idx + 2]! * 0.114;

      // Sobel gradient magnitude
      const idxR = (y * width + (x + 1)) * 4;
      const idxL = (y * width + (x - 1)) * 4;
      const idxD = ((y + 1) * width + x) * 4;
      const idxU = ((y - 1) * width + x) * 4;

      const lumR = data[idxR]! * 0.299 + data[idxR + 1]! * 0.587 + data[idxR + 2]! * 0.114;
      const lumL = data[idxL]! * 0.299 + data[idxL + 1]! * 0.587 + data[idxL + 2]! * 0.114;
      const lumD = data[idxD]! * 0.299 + data[idxD + 1]! * 0.587 + data[idxD + 2]! * 0.114;
      const lumU = data[idxU]! * 0.299 + data[idxU + 1]! * 0.587 + data[idxU + 2]! * 0.114;

      const gx = lumR - lumL;
      const gy = lumD - lumU;
      const grad = Math.hypot(gx, gy);

      if (grad > maxGrad) {
        maxGrad = grad;
        bestPx = x;
        bestPy = y;
      }

      if (grad > 15) {
        sumGrad += grad;
        sumX += x * grad;
        sumY += y * grad;
      }
      pixelCount++;
    }
  }

  // Calculate feature distinctiveness & confidence
  const avgGrad = pixelCount > 0 ? sumGrad / pixelCount : 0;
  const contrastRatio = maxGrad > 0 ? maxGrad / (avgGrad + 10) : 0;

  // Normalized confidence metric: depends on edge sharpness (contrast ratio) and gradient magnitude
  const rawConfidence = clamp(
    (maxGrad / 180) * 0.6 + (Math.min(contrastRatio, 4) / 4) * 0.4,
    0,
    1,
  );
  const confidence = Math.round(rawConfidence * 100) / 100;

  // If confidence is below threshold, position cannot be verified -> mark as unknown
  if (confidence < settings.minConfidenceThreshold || maxGrad < 12) {
    return {
      id,
      label: isA ? "Primary Point A" : "Primary Point B",
      status: "unknown",
      x: null,
      y: null,
      confidence,
      referenceGroup: isA ? "A" : "B",
      referencePointIds: refIds,
      referenceCentroid: centroid,
      displacement: null,
      method: "optical_gradient_analysis",
    };
  }

  // Refine coordinate via gradient-weighted centroid if available, else max gradient peak
  const finalX = sumGrad > 0 ? sumX / sumGrad : bestPx;
  const finalY = sumGrad > 0 ? sumY / sumGrad : bestPy;

  const nx = clamp(Math.round(((finalX / width) * 100) * 10) / 10, 0, 100);
  const ny = clamp(Math.round(((finalY / height) * 100) * 10) / 10, 0, 100);
  const displacement = computeDisplacement(nx, ny, centroid);

  return {
    id,
    label: isA ? "Primary Point A" : "Primary Point B",
    status: "tracking",
    x: nx,
    y: ny,
    confidence,
    referenceGroup: isA ? "A" : "B",
    referencePointIds: refIds,
    referenceCentroid: centroid,
    displacement,
    method: "optical_gradient_analysis",
  };
}

/**
 * Optical tracking algorithm for the interactive demo simulation stage:
 * Evaluates the real geometric model of the demo light sculpture without fabricating arbitrary data.
 * Adheres strictly to:
 * - When scene cuts occur (cut > 0.18), optical tracking loses lock -> status is unknown/lost.
 * - When energy is low or out of bounds -> status is unknown.
 * - Maintains absolute separation between Primary A/B and reference points.
 */
export function trackFrameFromDemo(
  tMs: number,
  referencePoints: Record<ReferencePointId, ReferencePoint>,
  settings: OpticalTrackingSettings,
): OpticalTrackingFrame {
  if (!settings.enabled) {
    return createInactiveFrame(tMs, referencePoints);
  }

  const pose = demoPoseAt(tMs);

  const ptsA = ["A1", "A2", "A3"].map((id) => referencePoints[id as ReferencePointId]).filter(Boolean);
  const ptsB = ["B1", "B2", "B3"].map((id) => referencePoints[id as ReferencePointId]).filter(Boolean);
  const centroidA = computeCentroid(ptsA);
  const centroidB = computeCentroid(ptsB);

  // If scene cut score is high, optical tracking loses lock
  if (pose.cut > 0.18) {
    return {
      tMs,
      primaryA: {
        id: "Primary_A",
        label: "Primary Point A",
        status: "lost",
        x: null,
        y: null,
        confidence: 0.1,
        referenceGroup: "A",
        referencePointIds: ["A1", "A2", "A3"],
        referenceCentroid: centroidA,
        displacement: null,
        method: "demo_pose_tracker",
      },
      primaryB: {
        id: "Primary_B",
        label: "Primary Point B",
        status: "lost",
        x: null,
        y: null,
        confidence: 0.1,
        referenceGroup: "B",
        referencePointIds: ["B1", "B2", "B3"],
        referenceCentroid: centroidB,
        displacement: null,
        method: "demo_pose_tracker",
      },
      distance: null,
      spanY: null,
      angleDeg: null,
      status: "searching",
      active: true,
      overallConfidence: 0.1,
    };
  }

  // In demo simulation, the physical subject vertical height is 10 + pose.pos * 56 (from bottom)
  // Converting to % top-relative coordinate:
  // Top crest position in % from top
  const subjectTopY = 100 - (10 + pose.pos * 56 + 18);
  const subjectBottomY = 100 - (10 + pose.hand * 56);
  const subjectCenterX = 50 - pose.cameraX * 22;

  // Primary Point A tracks the upper crest limit of the subject relative to Reference Centroid A
  const distA = Math.hypot(subjectCenterX - centroidA.x, subjectTopY - centroidA.y);
  const inSearchRadiusA = distA <= settings.searchRadiusPct * 1.8;

  // Primary Point B tracks the lower trough limit of the subject relative to Reference Centroid B
  const distB = Math.hypot(subjectCenterX - centroidB.x, subjectBottomY - centroidB.y);
  const inSearchRadiusB = distB <= settings.searchRadiusPct * 1.8;

  // Calculate confidence scores based on motion clarity, camera jitter, and search distance
  const cameraStability = clamp(1 - pose.camera * 0.7, 0.2, 1);
  const motionClarity = clamp(0.5 + pose.energy * 0.5, 0.3, 1);

  const confA = inSearchRadiusA
    ? clamp(Math.round(cameraStability * motionClarity * 0.92 * 100) / 100, 0, 1)
    : 0.22;

  const confB = inSearchRadiusB
    ? clamp(Math.round(cameraStability * motionClarity * 0.88 * 100) / 100, 0, 1)
    : 0.22;

  // Primary Point A resolution
  let primaryA: PrimaryTrackedPoint;
  if (confA >= settings.minConfidenceThreshold && inSearchRadiusA) {
    const x = clamp(Math.round(subjectCenterX * 10) / 10, 0, 100);
    const y = clamp(Math.round(subjectTopY * 10) / 10, 0, 100);
    primaryA = {
      id: "Primary_A",
      label: "Primary Point A",
      status: "tracking",
      x,
      y,
      confidence: confA,
      referenceGroup: "A",
      referencePointIds: ["A1", "A2", "A3"],
      referenceCentroid: centroidA,
      displacement: computeDisplacement(x, y, centroidA),
      method: "demo_pose_optical_model",
    };
  } else {
    primaryA = {
      id: "Primary_A",
      label: "Primary Point A",
      status: "unknown",
      x: null,
      y: null,
      confidence: confA,
      referenceGroup: "A",
      referencePointIds: ["A1", "A2", "A3"],
      referenceCentroid: centroidA,
      displacement: null,
      method: "demo_pose_optical_model",
    };
  }

  // Primary Point B resolution
  let primaryB: PrimaryTrackedPoint;
  if (confB >= settings.minConfidenceThreshold && inSearchRadiusB) {
    const x = clamp(Math.round(subjectCenterX * 10) / 10, 0, 100);
    const y = clamp(Math.round(subjectBottomY * 10) / 10, 0, 100);
    primaryB = {
      id: "Primary_B",
      label: "Primary Point B",
      status: "tracking",
      x,
      y,
      confidence: confB,
      referenceGroup: "B",
      referencePointIds: ["B1", "B2", "B3"],
      referenceCentroid: centroidB,
      displacement: computeDisplacement(x, y, centroidB),
      method: "demo_pose_optical_model",
    };
  } else {
    primaryB = {
      id: "Primary_B",
      label: "Primary Point B",
      status: "unknown",
      x: null,
      y: null,
      confidence: confB,
      referenceGroup: "B",
      referencePointIds: ["B1", "B2", "B3"],
      referenceCentroid: centroidB,
      displacement: null,
      method: "demo_pose_optical_model",
    };
  }

  const geo = computePrimaryGeometry(primaryA, primaryB);
  const overallConfidence = Math.round(((confA + confB) / 2) * 100) / 100;
  const isActivelyTracking = primaryA.status === "tracking" && primaryB.status === "tracking";

  return {
    tMs,
    primaryA,
    primaryB,
    distance: geo.distance,
    spanY: geo.spanY,
    angleDeg: geo.angleDeg,
    status: isActivelyTracking ? "active" : "searching",
    active: true,
    overallConfidence,
  };
}

/**
 * Universal optical tracking resolver for the current frame.
 * If tracking is disabled or points cannot be determined, displays them as unknown.
 */
export function trackCurrentFrame(
  videoEl: HTMLVideoElement | null,
  isDemo: boolean,
  tMs: number,
  referencePoints: Record<ReferencePointId, ReferencePoint>,
  settings: OpticalTrackingSettings,
): OpticalTrackingFrame {
  if (!settings.enabled) {
    return createInactiveFrame(tMs, referencePoints);
  }

  if (videoEl) {
    return trackFrameFromVideo(videoEl, tMs, referencePoints, settings);
  }

  if (isDemo) {
    return trackFrameFromDemo(tMs, referencePoints, settings);
  }

  return {
    tMs,
    primaryA: createUnknownTrackedPoint("Primary_A", referencePoints),
    primaryB: createUnknownTrackedPoint("Primary_B", referencePoints),
    distance: null,
    spanY: null,
    angleDeg: null,
    status: "unavailable",
    active: true,
    overallConfidence: 0,
  };
}
