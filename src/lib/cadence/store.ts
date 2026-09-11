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
  createInactiveFrame,
  trackCurrentFrame,
} from "./tracking.ts";
import type {
  AbRegion,
  Action,
  CalibrationPresetId,
  CalibrationVector,
  MotionSample,
  OpticalTrackingFrame,
  OpticalTrackingSettings,
  PrimaryTrackedPoint,
  ProjectMeta,
  ProjectWorkflowState,
  ReferencePoint,
  ReferencePointId,
  ReviewFlag,
  ScriptStats,
  StyleId,
  StylePreset,
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
  confirmAbRegion: () => void;
  resetAbRegion: () => void;
  setReferencePointCoord: (id: ReferencePointId, x: number, y: number) => void;
  setActivePointId: (id: ReferencePointId | null) => void;
  applyCalibrationPreset: (presetId: CalibrationPresetId) => void;
  confirmCalibration: () => void;
  unlockCalibration: () => void;
  resetCalibrationPoints: () => void;
  toggleCalibrationOverlay: () => void;
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
      confirmed: false, // Setting/re-setting A or B requires re-confirmation
    };
    set({
      abRegion: updated,
      workflowState: "media_loaded",
      toast: `Point ${point} set at ${Math.round(targetMs / 1000)}s`,
    });
  },

  confirmAbRegion: () => {
    const { abRegion } = get();
    if (abRegion.startMs === null || abRegion.endMs === null) {
      set({ toast: "Both Point A and Point B must be set before confirming." });
      return;
    }
    const startMs = Math.min(abRegion.startMs, abRegion.endMs);
    const endMs = Math.max(abRegion.startMs, abRegion.endMs);
    if (startMs === endMs) {
      set({ toast: "Point A and Point B cannot be at the exact same timestamp." });
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
      playheadMs: startMs, // Automatically present Frame A for A1-A3 reference point selection
      toast: "A–B region confirmed! On Frame A, select reference points A1–A3.",
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
      toast: "A–B region reset.",
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
    const { isTrackingActive, trackingSettings, playheadMs, calibrationPoints, meta } = get();
    if (!isTrackingActive || !trackingSettings.enabled) {
      set({ currentTrackingFrame: createInactiveFrame(playheadMs, calibrationPoints) });
      return;
    }
    const isDemo = meta.sourceKind === "demo";
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
      toast: `Loaded ${file.name}. Navigate video to set Point A.`,
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
      toast: "Loaded demo sandbox. Use Set A and Set B to define region.",
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
