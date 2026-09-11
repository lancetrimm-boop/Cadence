import type { Action, ScriptStats } from "./types.ts";
import { clamp } from "./format.ts";

export function computeStats(actions: Action[], durationMs: number): ScriptStats {
  const sorted = [...actions].sort((a, b) => a.at - b.at);
  if (sorted.length < 2) {
    return {
      actions: sorted.length,
      strokes: 0,
      durationMs,
      densityPerMin: 0,
      meanAmplitude: 0,
      medianStrokeMs: 0,
      upDownRatio: 1,
      upperShare: 0,
      lowerShare: 0,
      holdCount: 0,
      rangeUsed: 0,
    };
  }

  const minutes = Math.max(durationMs / 60000, 1 / 60);
  let strokes = 0;
  let ampSum = 0;
  const strokeMs: number[] = [];
  let upMs = 0;
  let downMs = 0;
  let holdCount = 0;
  let minP = 100;
  let maxP = 0;

  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    const dt = Math.max(1, b.at - a.at);
    const dp = b.pos - a.pos;
    minP = Math.min(minP, a.pos, b.pos);
    maxP = Math.max(maxP, a.pos, b.pos);
    if (Math.abs(dp) <= 1) {
      if (dt >= 180) holdCount += 1;
      continue;
    }
    strokes += 1;
    ampSum += Math.abs(dp);
    strokeMs.push(dt);
    if (dp > 0) upMs += dt;
    else downMs += dt;
  }

  strokeMs.sort((a, b) => a - b);
  const medianStrokeMs = strokeMs.length
    ? strokeMs[Math.floor(strokeMs.length / 2)]!
    : 0;

  const span = Math.max(1, durationMs);
  let upper = 0;
  let lower = 0;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    const dt = b.at - a.at;
    const mid = (a.pos + b.pos) / 2;
    if (mid >= 70) upper += dt;
    if (mid <= 30) lower += dt;
  }

  return {
    actions: sorted.length,
    strokes,
    durationMs,
    densityPerMin: sorted.length / minutes,
    meanAmplitude: strokes ? ampSum / strokes : 0,
    medianStrokeMs,
    upDownRatio: downMs > 0 ? upMs / downMs : 1,
    upperShare: clamp(upper / span, 0, 1),
    lowerShare: clamp(lower / span, 0, 1),
    holdCount,
    rangeUsed: Math.max(0, maxP - minP),
  };
}

export function amplitudeHistogram(actions: Action[], buckets = 8): number[] {
  const sorted = [...actions].sort((a, b) => a.at - b.at);
  const counts = new Array<number>(buckets).fill(0);
  for (let i = 1; i < sorted.length; i++) {
    const dp = Math.abs(sorted[i]!.pos - sorted[i - 1]!.pos);
    if (dp <= 1) continue;
    const idx = clamp(Math.floor((dp / 100) * buckets), 0, buckets - 1);
    counts[idx]! += 1;
  }
  const max = Math.max(1, ...counts);
  return counts.map((c) => c / max);
}

export function positionHistogram(actions: Action[], buckets = 10): number[] {
  const sorted = [...actions].sort((a, b) => a.at - b.at);
  const time = new Array<number>(buckets).fill(0);
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    const mid = (a.pos + b.pos) / 2;
    const idx = clamp(Math.floor((mid / 100) * buckets), 0, buckets - 1);
    time[idx]! += Math.max(0, b.at - a.at);
  }
  const max = Math.max(1, ...time);
  return time.map((t) => t / max);
}
