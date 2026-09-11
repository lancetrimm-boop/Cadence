import type { Action, MotionSample, StylePreset } from "./types.ts";
import { clamp, lerp, mulberry32, roundPos, uid } from "./format.ts";
import { findExtrema, movingAverage } from "./signal.ts";

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function easeInCubic(t: number): number {
  return t * t * t;
}

function mapPos(unit: number, style: StylePreset): number {
  return roundPos(lerp(style.minPos, style.maxPos, clamp(unit, 0, 1)));
}

function smoothSignal(samples: MotionSample[], smoothing: number): number[] {
  const radius = Math.max(0, Math.round(smoothing * 6));
  return movingAverage(
    samples.map((s) => s.pos),
    radius,
  );
}

/**
 * Convert a continuous motion curve into discrete funscript actions,
 * shaped by a scripting style. Extrema stay locked to the source timing;
 * extra points change stroke *shape* (slow up / fast down) without desync.
 */
export function generateActions(
  samples: MotionSample[],
  style: StylePreset,
  durationMs: number,
): Action[] {
  if (samples.length === 0) return [];
  const rng = mulberry32(Math.round(durationMs + style.prominence * 1000 + samples.length));
  const smoothed = smoothSignal(samples, style.smoothing);
  const extrema = findExtrema(smoothed, style.prominence, 3);

  const kept = extrema.filter((ex, i) => {
    if (i === 0 || i === extrema.length - 1) return true;
    if (style.cadenceSkip <= 0) return true;
    const prev = extrema[i - 1]!;
    const next = extrema[i + 1]!;
    const span = next.value - prev.value;
    const local = Math.abs(ex.value - prev.value);
    const minor = local < Math.abs(span) * 0.35;
    if (minor && rng() < style.cadenceSkip) return false;
    return true;
  });

  const actions: Action[] = [];
  const push = (at: number, pos: number) => {
    const t = clamp(Math.round(at), 0, Math.max(0, Math.round(durationMs)));
    const last = actions[actions.length - 1];
    if (last && Math.abs(last.at - t) < 18 && last.pos === pos) return;
    if (last && last.at === t) {
      last.pos = pos;
      return;
    }
    actions.push({ id: uid("a"), at: t, pos });
  };

  if (kept.length === 0) {
    push(0, mapPos(smoothed[0] ?? 0.5, style));
    push(durationMs, mapPos(smoothed[smoothed.length - 1] ?? 0.5, style));
    return actions;
  }

  const sampleAt = (index: number) => samples[clamp(index, 0, samples.length - 1)]!;

  push(0, mapPos(smoothed[0] ?? kept[0]!.value, style));

  for (let i = 0; i < kept.length; i++) {
    const cur = kept[i]!;
    const next = kept[i + 1];
    const t0 = sampleAt(cur.index).t;
    const p0 = mapPos(cur.value, style);
    push(t0, p0);

    if (!next) continue;
    const t1 = sampleAt(next.index).t;
    const p1 = mapPos(next.value, style);
    const dt = t1 - t0;
    if (dt < 40) continue;

    const goingUp = p1 > p0;
    const count = goingUp ? style.upPoints : style.downPoints;
    if (count <= 0) continue;

    for (let k = 1; k <= count; k++) {
      const u = k / (count + 1);
      const shaped = goingUp ? easeOutCubic(u) : easeInCubic(u);
      // Fast down: travel happens early. Slow up: travel delayed.
      const travel = goingUp ? easeInCubic(u) : easeOutCubic(u);
      const at = t0 + dt * (goingUp ? lerp(u, travel, 0.7) : lerp(u, shaped, 0.55));
      const pos = roundPos(lerp(p0, p1, goingUp ? easeInCubic(u) : easeOutCubic(u)));
      push(at, pos);
    }
  }

  const lastS = samples[samples.length - 1]!;
  push(lastS.t, mapPos(smoothed[smoothed.length - 1] ?? lastS.pos, style));
  if (durationMs - lastS.t > 80) {
    push(durationMs, actions[actions.length - 1]!.pos);
  }

  insertHolds(actions, samples, style, durationMs);
  return actions;
}

function insertHolds(
  actions: Action[],
  samples: MotionSample[],
  style: StylePreset,
  durationMs: number,
) {
  if (samples.length === 0) return;
  const holds: Array<{ start: number; end: number }> = [];
  let runStart: number | null = null;
  for (const s of samples) {
    if (s.energy < style.pauseThreshold) {
      if (runStart == null) runStart = s.t;
    } else if (runStart != null) {
      if (s.t - runStart >= style.minHoldMs) holds.push({ start: runStart, end: s.t });
      runStart = null;
    }
  }
  const lastT = samples[samples.length - 1]!.t;
  if (runStart != null && lastT - runStart >= style.minHoldMs) {
    holds.push({ start: runStart, end: Math.max(lastT, durationMs) });
  }

  for (const h of holds) {
    const posAt = (t: number) => {
      const before = [...actions].reverse().find((a) => a.at <= t);
      return before?.pos ?? 50;
    };
    const pos = posAt(h.start);
    const startId = uid("a");
    const endId = uid("a");
    actions.push({ id: startId, at: Math.round(h.start), pos });
    actions.push({ id: endId, at: Math.round(h.end), pos });
  }

  actions.sort((a, b) => a.at - b.at || a.pos - b.pos);
  // Dedup near-identical neighbors after hold insertion.
  for (let i = actions.length - 1; i > 0; i--) {
    const a = actions[i]!;
    const b = actions[i - 1]!;
    if (Math.abs(a.at - b.at) < 12 && Math.abs(a.pos - b.pos) <= 1) {
      actions.splice(i, 1);
    }
  }
}

export function regenerateKeepTiming(
  samples: MotionSample[],
  style: StylePreset,
  durationMs: number,
): Action[] {
  return generateActions(samples, style, durationMs);
}
