import type { MotionSample } from "./types.ts";
import { clamp } from "./format.ts";
import { detectFlags } from "./flags.ts";
import { highPass, movingAverage, normalizePercentile } from "./signal.ts";

const W = 80;
const H = 45;
const BLOCK = 10;
const COLS = W / BLOCK;
const ROWS = H / BLOCK;

function luma(data: Uint8ClampedArray, x: number, y: number): number {
  const i = (y * W + x) * 4;
  return data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114;
}

function histogram(data: Uint8ClampedArray, bins = 16): number[] {
  const hist = new Array<number>(bins).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const y = data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114;
    const b = Math.min(bins - 1, Math.floor((y / 256) * bins));
    hist[b]! += 1;
  }
  const n = data.length / 4 || 1;
  return hist.map((v) => v / n);
}

function histDiff(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i]! - b[i]!);
  return s / 2;
}

type BlockVec = { dx: number; dy: number; err: number };

function blockFlow(prev: Uint8ClampedArray, next: Uint8ClampedArray): BlockVec[] {
  const out: BlockVec[] = [];
  const search = 3;
  for (let by = 0; by < ROWS; by++) {
    for (let bx = 0; bx < COLS; bx++) {
      const x0 = bx * BLOCK;
      const y0 = by * BLOCK;
      let best = Infinity;
      let bdx = 0;
      let bdy = 0;
      for (let dy = -search; dy <= search; dy++) {
        for (let dx = -search; dx <= search; dx++) {
          let sad = 0;
          let n = 0;
          for (let y = 0; y < BLOCK; y += 2) {
            for (let x = 0; x < BLOCK; x += 2) {
              const sx = x0 + x;
              const sy = y0 + y;
              const tx = sx + dx;
              const ty = sy + dy;
              if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
              sad += Math.abs(luma(next, sx, sy) - luma(prev, tx, ty));
              n += 1;
            }
          }
          const err = n ? sad / n : 999;
          if (err < best) {
            best = err;
            bdx = dx;
            bdy = dy;
          }
        }
      }
      out.push({ dx: bdx, dy: bdy, err: best });
    }
  }
  return out;
}

export type AnalyzeProgress = (p: { done: number; total: number; t: number }) => void;

type FrameAcc = {
  samples: MotionSample[];
  rawY: number[];
  energies: number[];
  prev: Uint8ClampedArray | null;
  prevHist: number[] | null;
};

function consumeFrame(acc: FrameAcc, t: number, data: Uint8ClampedArray) {
  const hist = histogram(data);
  const cut = acc.prevHist ? histDiff(acc.prevHist, hist) : 0;
  acc.prevHist = hist;

  let energy = 0;
  let cy = 0;
  let weight = 0;
  if (acc.prev) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = Math.abs(luma(data, x, y) - luma(acc.prev, x, y));
        if (d > 8) {
          energy += d;
          cy += y * d;
          weight += d;
        }
      }
    }
  }
  energy = energy / (W * H * 32);
  const centroidY = weight > 0 ? cy / weight / H : 0.5;

  let camera = 0;
  let local = energy;
  let dyMean = 0;
  if (acc.prev) {
    const flow = blockFlow(acc.prev, data);
    const mx = flow.reduce((s, v) => s + v.dx, 0) / flow.length;
    const my = flow.reduce((s, v) => s + v.dy, 0) / flow.length;
    dyMean = my;
    const mag = Math.hypot(mx, my);
    const variance =
      flow.reduce((s, v) => s + (v.dx - mx) ** 2 + (v.dy - my) ** 2, 0) / flow.length;
    camera = clamp(mag / 4, 0, 1) * (variance < 4 ? 1 : 0.45);
    local = clamp(energy * (variance > 3 ? 1.2 : 0.5), 0, 1);
  }

  acc.rawY.push(centroidY - dyMean * 0.08);
  acc.energies.push(clamp(energy, 0, 1));
  acc.samples.push({
    t,
    pos: centroidY,
    energy: clamp(energy, 0, 1),
    camera,
    local,
    cut: clamp(cut * 3.2, 0, 1),
  });
  acc.prev = new Uint8ClampedArray(data);
}

function finalizeSamples(acc: FrameAcc): MotionSample[] {
  const filtered = highPass(acc.rawY, 18);
  const inverted = filtered.map((v) => -v);
  const norm = normalizePercentile(inverted, 0.1, 0.9);
  const energyS = movingAverage(acc.energies, 2);
  for (let i = 0; i < acc.samples.length; i++) {
    const e = energyS[i] ?? 0;
    const hold = e < 0.08 ? acc.samples[Math.max(0, i - 1)]?.pos ?? 0.5 : norm[i]!;
    acc.samples[i]!.pos = clamp(e < 0.08 ? hold : norm[i]!, 0, 1);
    acc.samples[i]!.energy = e;
  }
  return acc.samples;
}

function drawVideoFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unsupported.");
  ctx.drawImage(video, 0, 0, W, H);
  return ctx.getImageData(0, 0, W, H);
}

export async function analyzeVideoElement(
  video: HTMLVideoElement,
  opts: {
    fps?: number;
    onProgress?: AnalyzeProgress;
    signal?: AbortSignal;
  } = {},
): Promise<{ samples: MotionSample[]; flags: ReturnType<typeof detectFlags> }> {
  const fps = opts.fps ?? 10;
  const duration = (video.duration || 0) * 1000;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Video has no duration. Try another file.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const step = 1000 / fps;
  const times: number[] = [];
  for (let t = 0; t <= duration; t += step) times.push(t);
  if (times[times.length - 1]! < duration - 20) times.push(duration);

  const wasMuted = video.muted;
  video.muted = true;

  const seekTo = (tMs: number) =>
    new Promise<void>((resolve, reject) => {
      if (opts.signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
        resolve();
      };
      const onError = () => {
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
        reject(new Error("Video seek failed."));
      };
      video.addEventListener("seeked", onSeeked);
      video.addEventListener("error", onError);
      video.currentTime = tMs / 1000;
    });

  const acc: FrameAcc = {
    samples: [],
    rawY: [],
    energies: [],
    prev: null,
    prevHist: null,
  };

  try {
    for (let i = 0; i < times.length; i++) {
      if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const t = times[i]!;
      await seekTo(t);
      consumeFrame(acc, t, drawVideoFrame(video, canvas).data);
      if (i % 4 === 0) {
        opts.onProgress?.({ done: i + 1, total: times.length, t });
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  } finally {
    video.muted = wasMuted;
  }

  const samples = finalizeSamples(acc);
  opts.onProgress?.({ done: times.length, total: times.length, t: duration });
  return { samples, flags: detectFlags(samples) };
}

export const ANALYZE_SIZE = { w: W, h: H };
