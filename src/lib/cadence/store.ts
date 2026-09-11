import { create } from "zustand";
import { analyzeVideoElement } from "./analyzer.ts";
import { createDemoProject } from "./demo.ts";
import { clamp } from "./format.ts";
import { parseFunscript, sanitizeAction, sortActions } from "./funscript.ts";
import { generateActions } from "./generator.ts";
import { computeStats } from "./stats.ts";
import { STYLE_LIST, STYLES } from "./style.ts";
import type {
  Action,
  MotionSample,
  ProjectMeta,
  ReviewFlag,
  StyleId,
  StylePreset,
} from "./types.ts";

const HISTORY_MAX = 60;

export type StudioState = {
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

const demo = createDemoProject();

const initial: StudioState = {
  meta: demo.meta,
  samples: demo.samples,
  flags: demo.flags,
  actions: demo.actions,
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
      videoUrl,
      playing: false,
      playheadMs: 0,
      analysis: { running: true, progress: 0, label: "Reading video…" },
      meta: {
        title: file.name.replace(/\.[a-z0-9]+$/i, ""),
        sourceKind: "video",
        sourceName: file.name,
        durationMs: get().meta.durationMs,
      },
      toast: `Opened ${file.name}`,
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
    const next = createDemoProject();
    set({
      ...initial,
      meta: next.meta,
      samples: next.samples,
      flags: next.flags,
      actions: next.actions,
      videoUrl: null,
      toast: "Loaded demo session",
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

export function useScriptStats() {
  return useStudio((s) => computeStats(s.actions, s.meta.durationMs));
}

export { visibleSpan };
