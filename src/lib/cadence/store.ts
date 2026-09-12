import { useMemo } from "react";
import { create } from "zustand";
import { analyzeVideoElement } from "./analyzer.ts";
import {
  CALIBRATION_PRESETS,
  createDefaultPoints,
  createUnsetPoints,
  areAllPointsCalibrated,
  computeCalibrationVector,
  sanitizeCoord,
  POINT_IDS,
} from "./calibration.ts";
import { createDemoProject } from "./demo.ts";
import { clamp } from "./format.ts";
import { parseFunscript, sanitizeAction, sortActions } from "./funscript.ts";
import { generateActions } from "./generator.ts";
import { computeStats } from "./stats.ts";
import { STYLE_LIST, STYLES } from "./style.ts";
import {
  DEFAULT_TRACKING_SETTINGS,
  attemptReacquisition,
  createInactiveFrame,
  trackCurrentFrame,
  trackPrimaryPointsFrame,
} from "./tracking.ts";
import type {
  AbRegion,
  Action,
  CalibrationPresetId,
  CalibrationVector,
  InteractiveIndicator,
  MotionSample,
  OpticalTrackingFrame,
  OpticalTrackingSettings,
  PrimaryPointId,
  PrimaryPointState,
  PrimarySetupStep,
  PrimaryTrackedPoint,
  ProjectMeta,
  ProjectWorkflowState,
  RecoveryReferencePoint,
  ReferencePoint,
  ReferencePointId,
  ReviewFlag,
  ScriptStats,
  StyleId,
  StylePreset,
  TrackingHistoryEntry,
  ViewerTransform,
} from "./types.ts";

const HISTORY_MAX = 60;

export type StudioState = {
  activeView: "home" | "studio";
  workflowState: ProjectWorkflowState;
  abRegion: AbRegion;
  calibrationPoints: Record<ReferencePointId, ReferencePoint>;
  activePointId: ReferencePointId | null;
  selectedPresetId: CalibrationPresetId;
  isCalibrationLocked: boolean;
  showCalibrationOverlay: boolean;
  // Simplified Primary Tracking State
  primaryPointA: PrimaryPointState;
  primaryPointB: PrimaryPointState;
  primarySetupStep: PrimarySetupStep;
  trackingHistory: TrackingHistoryEntry[];
  failedPoint: "A" | "B" | "both" | null;
  consecutiveLowConfFrames: number;
  recoveryReferences: RecoveryReferencePoint[];
  activeRecoveryRefId: string | null;
  proposedReacquisition: { pointId: "A" | "B"; x: number; y: number; confidence: number } | null;
  // Interactive Indicator Overlay
  indicator: InteractiveIndicator;
  // Viewer Display Transform (Zoom & Pan)
  viewerTransform: ViewerTransform;
  // Graph View Preference
  activeGraphView: "both" | "script" | "tracking";
  // Phase 3: Optical Tracking State
  isTrackingActive: boolean;
  trackingSettings: OpticalTrackingSettings;
  currentTrackingFrame: OpticalTrackingFrame;
  meta: ProjectMeta;
  samples: MotionSample[];
  flags: ReviewFlag[];
  actions: Action[];
  selectedId: string | null;
  styleId: StyleId;
  style: StylePreset;
  playheadMs: number;
  playing: boolean;
  zoom: number;
  viewStartMs: number;
  analysis: { running: boolean; progress: number; label: string } | null;
  videoUrl: string | null;
  history: Action[][];
  future: Action[][];
  dirty: boolean;
  toast: string | null;
};

type StudioActions = {
  setActiveView: (view: "home" | "studio") => void;
  setWorkflowState: (state: ProjectWorkflowState) => void;
  setRegionPoint: (point: "A" | "B", ms?: number) => void;
  setRegionPointDirect: (point: "A" | "B", ms: number) => void;
  confirmAbRegion: () => void;
  resetAbRegion: () => void;
  setReferencePointCoord: (id: ReferencePointId, x: number, y: number) => void;
  setActivePointId: (id: ReferencePointId | null) => void;
  applyCalibrationPreset: (presetId: CalibrationPresetId) => void;
  confirmCalibration: () => void;
  unlockCalibration: () => void;
  resetCalibrationPoints: () => void;
  toggleCalibrationOverlay: () => void;
  // Primary A/B Tracking Actions
  setPrimaryPointCoord: (id: "A" | "B", x: number, y: number) => void;
  setPrimarySetupStep: (step: PrimarySetupStep) => void;
  resetPrimaryPoints: () => void;
  applyCenterPreset: () => void;
  // Viewer Zoom & Pan Actions
  setViewerZoom: (zoom: number, pan?: { x: number; y: number }) => void;
  setViewerPan: (panX: number, panY: number) => void;
  resetViewerTransform: () => void;
  // Interactive Indicator Actions
  updateIndicator: (partial: Partial<InteractiveIndicator>) => void;
  snapIndicatorToPoints: () => void;
  // Recovery Reference Actions
  addRecoveryReference: (x?: number, y?: number) => void;
  updateRecoveryReference: (id: string, x: number, y: number) => void;
  removeRecoveryReference: (id: string) => void;
  triggerAttemptReacquisition: (targetPoint?: "A" | "B") => void;
  confirmReacquisition: () => void;
  cancelRecovery: () => void;
  // Graph View & Script Conversion
  setActiveGraphView: (view: "both" | "script" | "tracking") => void;
  convertTrackingToScriptActions: () => void;
  // Phase 3 Optical Tracking Actions
  toggleOpticalTracking: () => void;
  setTrackingEnabled: (enabled: boolean) => void;
  setTrackingSettings: (settings: Partial<OpticalTrackingSettings>) => void;
  updateTrackingForPlayhead: (videoEl?: HTMLVideoElement | null) => void;
  resetTracking: () => void;
  updateVideoDuration: (durationMs: number) => void;
  setPlayhead: (ms: number, pause?: boolean) => void;
  togglePlay: () => void;
  setPlaying: (v: boolean) => void;
  setZoom: (z: number) => void;
  setViewStart: (ms: number) => void;
  select: (id: string | null) => void;
  moveAction: (id: string, at: number, pos: number) => void;
  addAction: (at: number, pos: number) => void;
  removeSelected: () => void;
  nudge: (dAt: number, dPos: number) => void;
  undo: () => void;
  redo: () => void;
  setStyle: (id: StyleId) => void;
  regenerate: () => void;
  importScript: (raw: string, filename: string) => void;
  loadVideoFile: (file: File) => Promise<void>;
  analyzeCurrentVideo: (video: HTMLVideoElement) => Promise<void>;
  resetDemo: () => void;
  setToast: (msg: string | null) => void;
};

function visibleSpan(zoom: number, durationMs: number): number {
  const base = 12000;
  return clamp(base / zoom, 1500, Math.max(1500, durationMs));
}

const initial: StudioState = {
  activeView: "home",
  workflowState: "unloaded",
  abRegion: {
    startMs: null,
    endMs: null,
    confirmed: false,
  },
  calibrationPoints: createUnsetPoints(),
  activePointId: null,
  selectedPresetId: "vertical_center",
  isCalibrationLocked: false,
  showCalibrationOverlay: false,
  // Simplified Primary Tracking Initial State — clean session requires Set A → Set B
  primaryPointA: {
    id: "A",
    label: "Primary Point A",
    x: null,
    y: null,
    set: false,
    status: "unknown",
    confidence: 0,
  },
  primaryPointB: {
    id: "B",
    label: "Primary Point B",
    x: null,
    y: null,
    set: false,
    status: "unknown",
    confidence: 0,
  },
  primarySetupStep: "set_a",
  trackingHistory: [],
  failedPoint: null,
  consecutiveLowConfFrames: 0,
  recoveryReferences: [],
  activeRecoveryRefId: null,
  proposedReacquisition: null,
  // Interactive Indicator Initial State
  indicator: {
    enabled: true,
    x: 14,
    y: 50,
    width: 6,
    height: 34,
    rotation: 0,
    selected: false,
    contrastOutline: true,
  },
  // Viewer Zoom & Pan Initial State
  viewerTransform: {
    zoom: 1,
    panX: 0,
    panY: 0,
  },
  // Graph View Preference
  activeGraphView: "both",
  // Phase 3: Optical Tracking Initial State
  isTrackingActive: false,
  trackingSettings: DEFAULT_TRACKING_SETTINGS,
  currentTrackingFrame: createInactiveFrame(0, createUnsetPoints()),
  meta: {
    title: "Untitled Project",
    sourceKind: "video",
    sourceName: "",
    durationMs: 30000,
  },
  samples: [],
  flags: [],
  actions: [],
  selectedId: null,
  styleId: "signature",
  style: STYLES.signature,
  playheadMs: 0,
  playing: false,
  zoom: 1,
  viewStartMs: 0,
  analysis: null,
  videoUrl: null,
  history: [],
  future: [],
  dirty: false,
  toast: null,
};

export const useStudio = create<StudioState & StudioActions>((set, get) => ({
  ...initial,

  setActiveView: (view) => set({ activeView: view }),

  setWorkflowState: (state) => set({ workflowState: state }),

  setRegionPoint: (point, ms) => {
    const playhead = get().playheadMs;
    const targetMs = Math.round(ms ?? playhead);
    const current = get().abRegion;
    const updated = {
      ...current,
      [point === "A" ? "startMs" : "endMs"]: targetMs,
      confirmed: false, // Setting/re-setting Beginning or End requires re-confirmation
    };
    set({
      abRegion: updated,
      workflowState: "media_loaded",
      toast: `${point === "A" ? "Beginning" : "End"} set at ${Math.round(targetMs / 1000)}s`,
    });
  },

  setRegionPointDirect: (point, ms) => {
    const targetMs = Math.max(0, Math.round(ms));
    const current = get().abRegion;
    set({
      abRegion: {
        ...current,
        [point === "A" ? "startMs" : "endMs"]: targetMs,
        confirmed: false,
      },
      workflowState: "media_loaded",
    });
  },

  confirmAbRegion: () => {
    const { abRegion } = get();
    if (abRegion.startMs === null || abRegion.endMs === null) {
      set({ toast: "Both Beginning and End must be set before confirming." });
      return;
    }
    const startMs = Math.min(abRegion.startMs, abRegion.endMs);
    const endMs = Math.max(abRegion.startMs, abRegion.endMs);
    if (startMs === endMs) {
      set({ toast: "Beginning and End cannot be at the exact same timestamp." });
      return;
    }
    set({
      abRegion: {
        startMs,
        endMs,
        confirmed: true,
      },
      workflowState: "reference_setup",
      showCalibrationOverlay: true,
      activePointId: "A1",
      playheadMs: startMs, // Automatically present Beginning frame for A1-A3 reference point selection
      toast: "Segment confirmed! On Beginning frame, select reference points A1–A3.",
    });
  },

  resetAbRegion: () => {
    set({
      abRegion: {
        startMs: null,
        endMs: null,
        confirmed: false,
      },
      workflowState: "media_loaded",
      activePointId: null,
      showCalibrationOverlay: false,
      isCalibrationLocked: false,
      calibrationPoints: createUnsetPoints(),
      isTrackingActive: false,
      currentTrackingFrame: createInactiveFrame(get().playheadMs, createUnsetPoints()),
      toast: "Video segment reset.",
    });
  },

  setReferencePointCoord: (id, x, y) => {
    const current = get().calibrationPoints;
    const point = current[id];
    if (!point || get().isCalibrationLocked) return;
    const updated = {
      ...current,
      [id]: {
        ...point,
        x: sanitizeCoord(x),
        y: sanitizeCoord(y),
        set: true,
      },
    };
    const allCalibrated = areAllPointsCalibrated(updated);
    set({
      calibrationPoints: updated,
      activePointId: id,
      workflowState: allCalibrated ? "phase2_complete" : "reference_setup",
      isCalibrationLocked: allCalibrated ? true : get().isCalibrationLocked,
      toast: allCalibrated
        ? "Phase 2 Complete: 6 Reference points established. Tracking foundation ready."
        : `Point ${id} set (${Math.round(x)}%, ${Math.round(y)}%)`,
    });
  },

  setActivePointId: (id) => set({ activePointId: id }),

  applyCalibrationPreset: (presetId) => {
    if (get().isCalibrationLocked) return;
    const preset = CALIBRATION_PRESETS[presetId];
    if (!preset) return;
    const current = get().calibrationPoints;
    const updated = {} as Record<ReferencePointId, ReferencePoint>;
    for (const id of POINT_IDS) {
      const p = current[id];
      const target = preset.points[id];
      updated[id] = {
        ...p,
        x: target.x,
        y: target.y,
        set: true,
      };
    }
    const allCalibrated = areAllPointsCalibrated(updated);
    set({
      calibrationPoints: updated,
      selectedPresetId: presetId,
      workflowState: allCalibrated ? "phase2_complete" : "reference_setup",
      isCalibrationLocked: allCalibrated ? true : get().isCalibrationLocked,
      toast: `Applied preset: ${preset.name}`,
    });
  },

  confirmCalibration: () => {
    const points = get().calibrationPoints;
    const valid = areAllPointsCalibrated(points);
    if (!valid) {
      set({ toast: "All 6 reference points (A1–A3, B1–B3) must be configured." });
      return;
    }
    set({
      isCalibrationLocked: true,
      workflowState: "phase2_complete",
      toast: "Phase 2 Complete: 6 Reference points established. Ready for tracking.",
    });
  },

  unlockCalibration: () => {
    set({
      isCalibrationLocked: false,
      workflowState: "reference_setup",
      toast: "Calibration unlocked. Adjust reference points as needed.",
    });
  },

  resetCalibrationPoints: () => {
    set({
      calibrationPoints: createUnsetPoints(),
      selectedPresetId: "vertical_center",
      isCalibrationLocked: false,
      isTrackingActive: false,
      currentTrackingFrame: createInactiveFrame(get().playheadMs, createUnsetPoints()),
      workflowState: get().abRegion.confirmed ? "reference_setup" : "media_loaded",
      activePointId: get().abRegion.confirmed ? "A1" : null,
      toast: "Reference points reset. Click video to place points.",
    });
  },

  toggleCalibrationOverlay: () => {
    set({ showCalibrationOverlay: !get().showCalibrationOverlay });
  },

  // Primary A/B Tracking Actions
  setPrimaryPointCoord: (id, x, y) => {
    const cleanX = clamp(Math.round(x * 10) / 10, 0, 100);
    const cleanY = clamp(Math.round(y * 10) / 10, 0, 100);
    const state = get();

    if (id === "A") {
      const nextA: PrimaryPointState = {
        ...state.primaryPointA,
        x: cleanX,
        y: cleanY,
        set: true,
        status: "tracking",
        confidence: 0.9,
      };
      const nextStep: PrimarySetupStep = state.primaryPointB.set ? "ready" : "set_b";
      set({
        primaryPointA: nextA,
        primarySetupStep: nextStep,
        toast: state.primaryPointB.set
          ? "Primary Point A updated. Ready to Track."
          : "Primary Point A placed. Now click to set Primary Point B.",
      });
      // Do not auto-start tracking; user advances Ready → Start Tracking
    } else {
      const nextB: PrimaryPointState = {
        ...state.primaryPointB,
        x: cleanX,
        y: cleanY,
        set: true,
        status: "tracking",
        confidence: 0.9,
      };
      const nextStep: PrimarySetupStep = state.primaryPointA.set ? "ready" : "set_a";
      set({
        primaryPointB: nextB,
        primarySetupStep: nextStep,
        toast: state.primaryPointA.set
          ? "Primary Point B placed. Ready to Track."
          : "Primary Point B placed. Now click to set Primary Point A.",
      });
    }
  },

  setPrimarySetupStep: (step) => set({ primarySetupStep: step }),

  resetPrimaryPoints: () => {
    set({
      primaryPointA: {
        id: "A",
        label: "Primary Point A",
        x: null,
        y: null,
        set: false,
        status: "unknown",
        confidence: 0,
      },
      primaryPointB: {
        id: "B",
        label: "Primary Point B",
        x: null,
        y: null,
        set: false,
        status: "unknown",
        confidence: 0,
      },
      primarySetupStep: "set_a",
      failedPoint: null,
      recoveryReferences: [],
      proposedReacquisition: null,
      toast: "Primary points cleared. Click video stage to place Primary Point A (crest).",
    });
  },

  applyCenterPreset: () => {
    set({
      primaryPointA: {
        id: "A",
        label: "Primary Point A",
        x: 50,
        y: 28,
        set: true,
        status: "tracking",
        confidence: 0.92,
      },
      primaryPointB: {
        id: "B",
        label: "Primary Point B",
        x: 50,
        y: 72,
        set: true,
        status: "tracking",
        confidence: 0.9,
      },
      primarySetupStep: "ready",
      isTrackingActive: true,
      failedPoint: null,
      toast: "Center tracking preset applied (Point A: 50%, 28% | Point B: 50%, 72%).",
    });
    get().updateTrackingForPlayhead(null);
  },

  // Viewer Zoom & Pan Actions
  setViewerZoom: (zoom, pan) => {
    const clampedZoom = clamp(Math.round(zoom * 100) / 100, 1, 8);
    const curTransform = get().viewerTransform;
    if (clampedZoom === 1) {
      set({ viewerTransform: { zoom: 1, panX: 0, panY: 0 } });
    } else {
      set({
        viewerTransform: {
          zoom: clampedZoom,
          panX: pan?.x ?? curTransform.panX,
          panY: pan?.y ?? curTransform.panY,
        },
      });
    }
  },

  setViewerPan: (panX, panY) => {
    const { zoom } = get().viewerTransform;
    if (zoom <= 1) {
      set({ viewerTransform: { zoom: 1, panX: 0, panY: 0 } });
      return;
    }
    // Limit max pan based on zoom level
    const maxPan = (zoom - 1) * 350;
    set({
      viewerTransform: {
        zoom,
        panX: clamp(panX, -maxPan, maxPan),
        panY: clamp(panY, -maxPan, maxPan),
      },
    });
  },

  resetViewerTransform: () => {
    set({ viewerTransform: { zoom: 1, panX: 0, panY: 0 } });
  },

  // Interactive Indicator Actions
  updateIndicator: (partial) => {
    set({ indicator: { ...get().indicator, ...partial } });
  },

  snapIndicatorToPoints: () => {
    const { primaryPointA, primaryPointB } = get();
    if (!primaryPointA.set || !primaryPointB.set || primaryPointA.x === null || primaryPointA.y === null || primaryPointB.x === null || primaryPointB.y === null) {
      set({ toast: "Set Primary Point A and B first to snap the indicator." });
      return;
    }
    const midX = (primaryPointA.x + primaryPointB.x) / 2;
    const midY = (primaryPointA.y + primaryPointB.y) / 2;
    const height = clamp(Math.round(Math.abs(primaryPointB.y - primaryPointA.y) * 10) / 10, 10, 80);
    const dx = primaryPointB.x - primaryPointA.x;
    const dy = primaryPointB.y - primaryPointA.y;
    // Calculate angle in degrees from vertical
    const angleRad = Math.atan2(dx, dy);
    const rotation = Math.round(-angleRad * (180 / Math.PI));

    set({
      indicator: {
        ...get().indicator,
        x: clamp(Math.round(midX * 10) / 10, 5, 95),
        y: clamp(Math.round(midY * 10) / 10, 5, 95),
        height,
        rotation,
        selected: true,
      },
      toast: "Indicator snapped to Primary Point A & B vector.",
    });
  },

  // Recovery Reference Point Actions
  addRecoveryReference: (x, y) => {
    const state = get();
    const count = state.recoveryReferences.length;
    const failed = state.failedPoint === "B" ? "B" : "A";
    const refPt = failed === "A" ? state.primaryPointA : state.primaryPointB;
    const defaultX = refPt.x ?? 50;
    const defaultY = (refPt.y ?? 50) + (count % 2 === 0 ? -6 : 6);

    const newRef: RecoveryReferencePoint = {
      id: `ref_${Date.now()}_${count}`,
      label: `R${count + 1}`,
      x: clamp(Math.round((x ?? defaultX) * 10) / 10, 2, 98),
      y: clamp(Math.round((y ?? defaultY) * 10) / 10, 2, 98),
      targetPoint: failed,
    };

    const nextRefs = [...state.recoveryReferences, newRef];
    set({
      recoveryReferences: nextRefs,
      activeRecoveryRefId: newRef.id,
      toast: `Reference Point ${newRef.label} added. Drag to position near target feature.`,
    });

    // Auto-calculate proposed reacquisition hypothesis
    const target = failed === "B" ? "B" : "A";
    get().triggerAttemptReacquisition(target);
  },

  updateRecoveryReference: (id, x, y) => {
    const state = get();
    const nextRefs = state.recoveryReferences.map((r) =>
      r.id === id ? { ...r, x: clamp(Math.round(x * 10) / 10, 1, 99), y: clamp(Math.round(y * 10) / 10, 1, 99) } : r,
    );
    set({ recoveryReferences: nextRefs });
    const target = state.failedPoint === "B" ? "B" : "A";
    get().triggerAttemptReacquisition(target);
  },

  removeRecoveryReference: (id) => {
    const nextRefs = get().recoveryReferences.filter((r) => r.id !== id);
    set({ recoveryReferences: nextRefs });
  },

  triggerAttemptReacquisition: (targetPoint) => {
    const state = get();
    const ptId: "A" | "B" = targetPoint ?? (state.failedPoint === "B" ? "B" : "A");
    const targetPtState = ptId === "A" ? state.primaryPointA : state.primaryPointB;
    const isDemo = state.meta.sourceKind === "demo";

    const hypothesis = attemptReacquisition(
      ptId,
      state.recoveryReferences,
      targetPtState,
      state.playheadMs,
      isDemo,
    );

    set({ proposedReacquisition: hypothesis });
  },

  confirmReacquisition: () => {
    const state = get();
    const prop = state.proposedReacquisition;
    if (!prop) return;

    if (prop.pointId === "A") {
      set({
        primaryPointA: {
          ...state.primaryPointA,
          x: prop.x,
          y: prop.y,
          set: true,
          status: "reacquired",
          confidence: prop.confidence,
        },
      });
    } else {
      set({
        primaryPointB: {
          ...state.primaryPointB,
          x: prop.x,
          y: prop.y,
          set: true,
          status: "reacquired",
          confidence: prop.confidence,
        },
      });
    }

    set({
      failedPoint: null,
      proposedReacquisition: null,
      recoveryReferences: [],
      consecutiveLowConfFrames: 0,
      primarySetupStep: "ready",
      isTrackingActive: true,
      toast: `Primary Point ${prop.pointId} successfully reacquired (${Math.round(prop.confidence * 100)}% confidence).`,
    });
    get().updateTrackingForPlayhead(null);
  },

  cancelRecovery: () => {
    set({
      failedPoint: null,
      proposedReacquisition: null,
      primarySetupStep: "ready",
      consecutiveLowConfFrames: 0,
    });
  },

  // Graph View & Script Conversion Actions
  setActiveGraphView: (view) => set({ activeGraphView: view }),

  convertTrackingToScriptActions: () => {
    const { trackingHistory, actions } = get();
    if (trackingHistory.length < 2) {
      set({ toast: "Not enough tracking history recorded to convert. Play video with tracking active first." });
      return;
    }

    // Convert tracking history points into peak/valley keyframe actions
    const newActions: Action[] = [];
    const sorted = [...trackingHistory].sort((a, b) => a.tMs - b.tMs);

    // Step through and sample inflection points
    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i]!;
      if (cur.status === "lost" && cur.overallConfidence < 0.2) continue;

      const isFirst = i === 0;
      const isLast = i === sorted.length - 1;

      if (isFirst || isLast) {
        newActions.push({
          id: `track_act_${cur.tMs}`,
          at: cur.tMs,
          pos: clamp(cur.movement, 0, 100),
        });
        continue;
      }

      const prev = sorted[i - 1]!;
      const next = sorted[i + 1]!;

      // Peak or trough turnaround
      const isPeak = cur.movement >= prev.movement && cur.movement >= next.movement && Math.abs(cur.movement - prev.movement) > 3;
      const isTrough = cur.movement <= prev.movement && cur.movement <= next.movement && Math.abs(cur.movement - prev.movement) > 3;

      if (isPeak || isTrough || cur.tMs - (newActions[newActions.length - 1]?.at ?? 0) >= 350) {
        newActions.push({
          id: `track_act_${cur.tMs}`,
          at: cur.tMs,
          pos: clamp(cur.movement, 0, 100),
        });
      }
    }

    if (newActions.length === 0) {
      set({ toast: "No valid tracking peaks detected to convert." });
      return;
    }

    const merged = sortActions([...actions, ...newActions]);
    set({
      history: [...get().history.slice(-HISTORY_MAX + 1), actions],
      future: [],
      actions: merged,
      dirty: true,
      activeGraphView: "both",
      toast: `Generated ${newActions.length} script action nodes from Auto Tracking data.`,
    });
  },

  // Phase 3: Optical Tracking Actions
  toggleOpticalTracking: () => {
    const { isTrackingActive, trackingSettings, workflowState } = get();
    const nextActive = !isTrackingActive;
    const nextSettings = { ...trackingSettings, enabled: nextActive };
    const nextWorkflow: ProjectWorkflowState = nextActive
      ? "phase3_tracking"
      : workflowState === "phase3_tracking"
      ? "phase2_complete"
      : workflowState;

    set({
      isTrackingActive: nextActive,
      trackingSettings: nextSettings,
      workflowState: nextWorkflow,
      toast: nextActive
        ? "Phase 3 Optical Tracking Active: Tracking Primary Points A & B."
        : "Optical Tracking Standby (Paused).",
    });
    get().updateTrackingForPlayhead(null);
  },

  setTrackingEnabled: (enabled) => {
    const { trackingSettings, workflowState } = get();
    const nextSettings = { ...trackingSettings, enabled };
    const nextWorkflow: ProjectWorkflowState = enabled
      ? "phase3_tracking"
      : workflowState === "phase3_tracking"
      ? "phase2_complete"
      : workflowState;

    set({
      isTrackingActive: enabled,
      trackingSettings: nextSettings,
      workflowState: nextWorkflow,
    });
    get().updateTrackingForPlayhead(null);
  },

  setTrackingSettings: (partial) => {
    const next = { ...get().trackingSettings, ...partial };
    set({ trackingSettings: next });
    if (get().isTrackingActive) {
      get().updateTrackingForPlayhead(null);
    }
  },

  updateTrackingForPlayhead: (videoEl) => {
    const {
      isTrackingActive,
      trackingSettings,
      playheadMs,
      calibrationPoints,
      meta,
      primaryPointA,
      primaryPointB,
      recoveryReferences,
      trackingHistory,
      consecutiveLowConfFrames,
      playing,
      primarySetupStep,
    } = get();

    if (!isTrackingActive) {
      set({ currentTrackingFrame: createInactiveFrame(playheadMs, calibrationPoints) });
      return;
    }

    const isDemo = meta.sourceKind === "demo";

    // Primary A & B Tracking Pipeline
    if (primaryPointA.set && primaryPointB.set && primarySetupStep !== "recovery") {
      const prevEntry = trackingHistory.length > 0 ? trackingHistory[trackingHistory.length - 1] : null;
      const entry = trackPrimaryPointsFrame(
        videoEl ?? null,
        isDemo,
        playheadMs,
        primaryPointA,
        primaryPointB,
        trackingSettings,
        recoveryReferences,
        prevEntry,
      );

      // Maintain complete tracking history (deduping entries within 30ms window)
      const filtered = trackingHistory.filter((h) => Math.abs(h.tMs - playheadMs) > 30);
      filtered.push(entry);
      filtered.sort((a, b) => a.tMs - b.tMs);
      const updatedHistory = filtered.slice(-1500); // retain rich history

      const nextPointA: PrimaryPointState = {
        ...primaryPointA,
        x: entry.ax ?? primaryPointA.x,
        y: entry.ay ?? primaryPointA.y,
        confidence: entry.confA,
        status: entry.confA >= trackingSettings.minConfidenceThreshold ? "tracking" : "low_confidence",
      };

      const nextPointB: PrimaryPointState = {
        ...primaryPointB,
        x: entry.bx ?? primaryPointB.x,
        y: entry.by ?? primaryPointB.y,
        confidence: entry.confB,
        status: entry.confB >= trackingSettings.minConfidenceThreshold ? "tracking" : "low_confidence",
      };

      const isLow = entry.confA < trackingSettings.minConfidenceThreshold || entry.confB < trackingSettings.minConfidenceThreshold;
      const nextConsecutive = isLow ? consecutiveLowConfFrames + 1 : 0;

      // Failure trigger after debounce window
      if (isLow && nextConsecutive >= trackingSettings.debounceFrames && trackingSettings.autoPauseOnFailure && playing) {
        const failed: "A" | "B" | "both" =
          entry.confA < trackingSettings.minConfidenceThreshold && entry.confB < trackingSettings.minConfidenceThreshold
            ? "both"
            : entry.confA < trackingSettings.minConfidenceThreshold
            ? "A"
            : "B";

        set({
          playing: false,
          failedPoint: failed,
          primarySetupStep: "recovery",
          primaryPointA: nextPointA,
          primaryPointB: nextPointB,
          trackingHistory: updatedHistory,
          consecutiveLowConfFrames: nextConsecutive,
          toast: `Tracking paused: Primary Point ${failed} confidence lost. Add reference points to reacquire.`,
        });
      } else {
        set({
          primaryPointA: nextPointA,
          primaryPointB: nextPointB,
          trackingHistory: updatedHistory,
          consecutiveLowConfFrames: nextConsecutive,
        });
      }
    }

    // Keep legacy frame updated for existing inspectors
    const frame = trackCurrentFrame(videoEl ?? null, isDemo, playheadMs, calibrationPoints, trackingSettings);
    set({ currentTrackingFrame: frame });
  },

  resetTracking: () => {
    const { playheadMs, calibrationPoints } = get();
    set({
      isTrackingActive: false,
      trackingSettings: { ...DEFAULT_TRACKING_SETTINGS, enabled: false },
      currentTrackingFrame: createInactiveFrame(playheadMs, calibrationPoints),
    });
  },

  updateVideoDuration: (durationMs) => {
    if (durationMs > 0 && durationMs !== get().meta.durationMs) {
      set({
        meta: {
          ...get().meta,
          durationMs,
        },
      });
    }
  },

  setPlayhead: (ms, pause) => {
    const duration = get().meta.durationMs;
    const t = clamp(ms, 0, duration);
    set({ playheadMs: t, ...(pause ? { playing: false } : {}) });
    const span = visibleSpan(get().zoom, duration);
    const start = get().viewStartMs;
    const margin = span * 0.12;
    if (t < start + margin) {
      set({ viewStartMs: clamp(t - margin, 0, Math.max(0, duration - span)) });
    } else if (t > start + span - margin) {
      set({ viewStartMs: clamp(t - span + margin, 0, Math.max(0, duration - span)) });
    }
    if (get().isTrackingActive) {
      get().updateTrackingForPlayhead(null);
    }
  },

  togglePlay: () => set({ playing: !get().playing }),
  setPlaying: (v) => set({ playing: v }),

  setZoom: (z) => {
    const zoom = clamp(z, 0.35, 8);
    const duration = get().meta.durationMs;
    const span = visibleSpan(zoom, duration);
    const playhead = get().playheadMs;
    const viewStartMs = clamp(playhead - span / 2, 0, Math.max(0, duration - span));
    set({ zoom, viewStartMs });
  },

  setViewStart: (ms) => {
    const duration = get().meta.durationMs;
    const span = visibleSpan(get().zoom, duration);
    set({ viewStartMs: clamp(ms, 0, Math.max(0, duration - span)) });
  },

  select: (id) => set({ selectedId: id }),

  moveAction: (id, at, pos) => {
    const { actions, meta } = get();
    const next = actions.map((a) =>
      a.id === id ? sanitizeAction(clamp(at, 0, meta.durationMs), pos, a.id) : a,
    );
    commitActions(set, get, sortActions(next));
  },

  addAction: (at, pos) => {
    const { meta } = get();
    const action = sanitizeAction(clamp(at, 0, meta.durationMs), pos);
    commitActions(set, get, sortActions([...get().actions, action]));
    set({ selectedId: action.id });
  },

  removeSelected: () => {
    const { selectedId, actions } = get();
    if (!selectedId) return;
    commitActions(
      set,
      get,
      actions.filter((a) => a.id !== selectedId),
    );
    set({ selectedId: null });
  },

  nudge: (dAt, dPos) => {
    const { selectedId, actions, meta } = get();
    if (!selectedId) return;
    const next = actions.map((a) =>
      a.id === selectedId
        ? sanitizeAction(clamp(a.at + dAt, 0, meta.durationMs), a.pos + dPos, a.id)
        : a,
    );
    commitActions(set, get, sortActions(next));
  },

  undo: () => {
    const { history, actions, future } = get();
    const prev = history[history.length - 1];
    if (!prev) return;
    set({
      actions: prev,
      history: history.slice(0, -1),
      future: [actions, ...future].slice(0, HISTORY_MAX),
      dirty: true,
    });
  },

  redo: () => {
    const { future, actions, history } = get();
    const next = future[0];
    if (!next) return;
    set({
      actions: next,
      future: future.slice(1),
      history: [...history, actions].slice(-HISTORY_MAX),
      dirty: true,
    });
  },

  setStyle: (id) => {
    const style = STYLES[id] ?? STYLE_LIST[0]!;
    set({ styleId: style.id, style });
  },

  regenerate: () => {
    const { samples, style, meta } = get();
    if (samples.length === 0) return;
    const actions = generateActions(samples, style, meta.durationMs);
    commitActions(set, get, actions);
    set({ selectedId: null, toast: `Regenerated with ${style.name}` });
  },

  importScript: (raw, filename) => {
    const parsed = parseFunscript(raw);
    const durationMs = Math.max(parsed.durationMs, get().meta.durationMs, 1000);
    commitActions(set, get, parsed.actions);
    set({
      activeView: "studio",
      workflowState: "calibrated",
      isCalibrationLocked: true,
      meta: {
        ...get().meta,
        title: parsed.title,
        durationMs,
        sourceKind: get().videoUrl ? get().meta.sourceKind : "script",
        sourceName: filename,
      },
      selectedId: null,
      toast: `Imported ${parsed.actions.length} actions`,
    });
  },

  loadVideoFile: async (file) => {
    const prev = get().videoUrl;
    if (prev) URL.revokeObjectURL(prev);
    const videoUrl = URL.createObjectURL(file);
    set({
      activeView: "studio",
      workflowState: "media_loaded",
      abRegion: {
        startMs: null,
        endMs: null,
        confirmed: false,
      },
      isCalibrationLocked: false,
      calibrationPoints: createUnsetPoints(),
      selectedPresetId: "vertical_center",
      activePointId: null,
      showCalibrationOverlay: false,
      // Clean primary A/B — user must Set A → Set B before tracking
      primaryPointA: {
        id: "A",
        label: "Primary Point A",
        x: null,
        y: null,
        set: false,
        status: "unknown",
        confidence: 0,
      },
      primaryPointB: {
        id: "B",
        label: "Primary Point B",
        x: null,
        y: null,
        set: false,
        status: "unknown",
        confidence: 0,
      },
      primarySetupStep: "set_a",
      isTrackingActive: false,
      trackingSettings: { ...DEFAULT_TRACKING_SETTINGS, enabled: false },
      trackingHistory: [],
      failedPoint: null,
      consecutiveLowConfFrames: 0,
      recoveryReferences: [],
      proposedReacquisition: null,
      videoUrl,
      playing: false,
      playheadMs: 0,
      analysis: null,
      samples: [],
      flags: [],
      actions: [],
      meta: {
        title: file.name.replace(/\.[a-z0-9]+$/i, ""),
        sourceKind: "video",
        sourceName: file.name,
        durationMs: 30000,
      },
      toast: `Loaded ${file.name}. Click the video to set Primary Point A.`,
    });
  },

  analyzeCurrentVideo: async (video) => {
    const durationMs = Math.round((video.duration || 0) * 1000);
    if (!durationMs) {
      set({ analysis: null, toast: "Could not read video duration." });
      throw new Error("Could not read video duration.");
    }
    set({
      meta: { ...get().meta, durationMs },
      analysis: { running: true, progress: 0.02, label: "Sampling frames…" },
      samples: [],
      flags: [],
      actions: [],
      playheadMs: 0,
      playing: false,
    });
    const { samples, flags } = await analyzeVideoElement(video, {
      fps: durationMs > 12 * 60_000 ? 6 : durationMs > 4 * 60_000 ? 8 : 10,
      onProgress: ({ done, total }) => {
        set({
          analysis: {
            running: true,
            progress: done / total,
            label: `Analyzing ${Math.round((done / total) * 100)}%`,
          },
        });
      },
    });
    const actions = generateActions(samples, get().style, durationMs);
    set({
      samples,
      flags,
      actions,
      analysis: null,
      dirty: false,
      history: [],
      future: [],
      selectedId: null,
      viewStartMs: 0,
      toast: `Draft ready · ${actions.length} actions · ${flags.length} review marks`,
    });
  },

  resetDemo: () => {
    const prev = get().videoUrl;
    if (prev) URL.revokeObjectURL(prev);
    set({
      ...initial,
      activeView: "studio",
      workflowState: "media_loaded",
      abRegion: {
        startMs: null,
        endMs: null,
        confirmed: false,
      },
      calibrationPoints: createUnsetPoints(),
      activePointId: null,
      showCalibrationOverlay: false,
      isCalibrationLocked: false,
      // initial already has unset primaries + set_a; keep explicit for clarity
      primarySetupStep: "set_a",
      isTrackingActive: false,
      trackingSettings: { ...DEFAULT_TRACKING_SETTINGS, enabled: false },
      trackingHistory: [],
      failedPoint: null,
      consecutiveLowConfFrames: 0,
      recoveryReferences: [],
      proposedReacquisition: null,
      meta: {
        title: "Demo Take — Light Sculpture",
        sourceKind: "demo",
        sourceName: "Built-in demo",
        durationMs: 48000,
      },
      samples: [],
      flags: [],
      actions: [],
      videoUrl: null,
      toast: "Demo sandbox ready. Click the video to set Primary Point A.",
    });
  },

  setToast: (msg) => set({ toast: msg }),
}));

function commitActions(
  set: (p: Partial<StudioState>) => void,
  get: () => StudioState,
  actions: Action[],
) {
  const { history, actions: current } = get();
  set({
    actions,
    history: [...history, current].slice(-HISTORY_MAX),
    future: [],
    dirty: true,
  });
}

export function viewWindow(state: Pick<StudioState, "zoom" | "viewStartMs" | "meta">): {
  start: number;
  end: number;
  span: number;
} {
  const span = visibleSpan(state.zoom, state.meta.durationMs);
  const start = state.viewStartMs;
  return { start, end: start + span, span };
}

export function useScriptStats(): ScriptStats {
  const actions = useStudio((s) => s.actions);
  const durationMs = useStudio((s) => s.meta.durationMs);
  return useMemo(() => computeStats(actions, durationMs), [actions, durationMs]);
}

export function useCalibrationVector(): CalibrationVector {
  const points = useStudio((s) => s.calibrationPoints);
  return useMemo(() => computeCalibrationVector(points), [points]);
}

export { visibleSpan };
