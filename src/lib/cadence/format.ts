export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** `m:ss.mmm` from milliseconds. */
export function formatTimecode(ms: number, withMillis = true): string {
  const clamped = Math.max(0, ms);
  const totalSec = Math.floor(clamped / 1000);
  const millis = Math.floor(clamped % 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const core = h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
  if (!withMillis) return core;
  return `${core}.${String(millis).padStart(3, "0")}`;
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return formatTimecode(ms, false);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function invLerp(a: number, b: number, v: number): number {
  if (b === a) return 0;
  return (v - a) / (b - a);
}

export function roundPos(pos: number): number {
  return clamp(Math.round(pos), 0, 100);
}

let seq = 0;
export function uid(prefix = "id"): string {
  seq += 1;
  return `${prefix}_${seq}`;
}

export function resetUidForTests() {
  seq = 0;
}

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
