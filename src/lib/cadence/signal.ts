import { clamp } from "./format.ts";

export function movingAverage(values: number[], radius: number): number[] {
  if (radius <= 0 || values.length === 0) return values.slice();
  const n = values.length;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - radius);
    const hi = Math.min(n - 1, i + radius);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += values[j]!;
    out[i] = sum / (hi - lo + 1);
  }
  return out;
}

export function highPass(values: number[], window: number): number[] {
  const trend = movingAverage(values, window);
  return values.map((v, i) => v - (trend[i] ?? v));
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const idx = clamp((s.length - 1) * p, 0, s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const a = s[lo]!;
  const b = s[hi]!;
  return a + (b - a) * (idx - lo);
}

export function normalizePercentile(values: number[], loP = 0.08, hiP = 0.92): number[] {
  const lo = percentile(values, loP);
  const hi = percentile(values, hiP);
  const span = hi - lo || 1;
  return values.map((v) => clamp((v - lo) / span, 0, 1));
}

export type Extremum = {
  index: number;
  value: number;
  kind: "peak" | "trough";
};

/**
 * Find peaks and troughs with a prominence floor (0–1 on the signal scale).
 */
export function findExtrema(values: number[], prominence: number, minGap = 2): Extremum[] {
  const n = values.length;
  if (n < 3) return [];
  const candidates: Extremum[] = [];
  for (let i = 1; i < n - 1; i++) {
    const v = values[i]!;
    const l = values[i - 1]!;
    const r = values[i + 1]!;
    if (v > l && v >= r) {
      candidates.push({ index: i, value: v, kind: "peak" });
    } else if (v < l && v <= r) {
      candidates.push({ index: i, value: v, kind: "trough" });
    }
  }

  const kept: Extremum[] = [];
  for (const c of candidates) {
    const window = 12;
    const lo = Math.max(0, c.index - window);
    const hi = Math.min(n - 1, c.index + window);
    let valley = c.value;
    let ridge = c.value;
    for (let i = lo; i <= hi; i++) {
      const v = values[i]!;
      if (v < valley) valley = v;
      if (v > ridge) ridge = v;
    }
    const prom = c.kind === "peak" ? c.value - valley : ridge - c.value;
    if (prom < prominence) continue;
    const prev = kept[kept.length - 1];
    if (prev && c.index - prev.index < minGap) {
      if (c.kind === prev.kind) {
        const better =
          (c.kind === "peak" && c.value >= prev.value) ||
          (c.kind === "trough" && c.value <= prev.value);
        if (better) kept[kept.length - 1] = c;
        continue;
      }
    }
    kept.push(c);
  }

  const alt: Extremum[] = [];
  for (const c of kept) {
    const prev = alt[alt.length - 1];
    if (!prev) {
      alt.push(c);
      continue;
    }
    if (prev.kind === c.kind) {
      const better =
        (c.kind === "peak" && c.value >= prev.value) ||
        (c.kind === "trough" && c.value <= prev.value);
      if (better) alt[alt.length - 1] = c;
      continue;
    }
    alt.push(c);
  }
  return alt;
}

export function resample(values: { t: number; v: number }[], t: number): number {
  if (values.length === 0) return 0;
  if (t <= values[0]!.t) return values[0]!.v;
  const last = values[values.length - 1]!;
  if (t >= last.t) return last.v;
  let lo = 0;
  let hi = values.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (values[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  const a = values[lo]!;
  const b = values[hi]!;
  const u = (t - a.t) / (b.t - a.t || 1);
  return a.v + (b.v - a.v) * u;
}
