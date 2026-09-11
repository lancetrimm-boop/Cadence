import type { MotionSample, ProjectMeta } from "./types.ts";
import { clamp, lerp } from "./format.ts";
import { detectFlags } from "./flags.ts";
import { generateActions } from "./generator.ts";
import { STYLES } from "./style.ts";
import type { Action, ReviewFlag } from "./types.ts";

export const DEMO_DURATION_MS = 48_000;
export const DEMO_HZ = 20;
export const DEMO_TITLE = "Studio take — light sculpture";

export type DemoPose = {
  /** Subject vertical 0–1 (0 = low). */
  pos: number;
  /** Secondary orb lag. */
  hand: number;
  energy: number;
  cameraX: number;
  camera: number;
  local: number;
  cut: number;
  scene: number;
  temp: number;
};

function sceneIndex(t: number): number {
  if (t < 8000) return 0;
  if (t < 11000) return 1;
  if (t < 24000) return 2;
  if (t < 26000) return 3;
  if (t < 31000) return 4;
  if (t < 33000) return 5;
  if (t < 44000) return 6;
  return 7;
}

function pulse(tMs: number, hz: number, phase = 0): number {
  return 0.5 + 0.5 * Math.sin((tMs / 1000) * hz * Math.PI * 2 + phase);
}

function irregular(tMs: number): number {
  return (
    0.55 * Math.sin(tMs * 0.00137) +
    0.28 * Math.sin(tMs * 0.0031 + 1.2) +
    0.17 * Math.sin(tMs * 0.00047 + 2.4)
  );
}

/** Parametric subject motion used both to draw and to seed the curve. */
export function demoPoseAt(tMs: number): DemoPose {
  const t = clamp(tMs, 0, DEMO_DURATION_MS);
  const scene = sceneIndex(t);
  let pos = 0.5;
  let energy = 0.05;
  let cameraX = 0;
  let camera = 0;
  let local = 0.7;
  let temp = 0.42;

  if (scene === 0) {
    const env = lerp(0.55, 0.78, t / 8000);
    pos = 0.5 + (pulse(t, 0.62, 0.2) - 0.5) * env + irregular(t) * 0.04;
    energy = 0.45 + env * 0.25;
    temp = 0.4;
  } else if (scene === 1) {
    pos = 0.22 + pulse(t, 0.12) * 0.03;
    energy = 0.05;
    local = 0.1;
    temp = 0.38;
  } else if (scene === 2) {
    const u = (t - 11000) / 13000;
    const hz = lerp(0.72, 1.02, u);
    const amp = lerp(0.58, 0.92, u * u);
    const wave = pulse(t, hz, 0.4);
    // Asymmetric: spend longer in the lower half.
    const shaped = wave < 0.5 ? wave * 0.85 : 0.425 + (wave - 0.5) * 1.15;
    pos = 0.5 + (shaped - 0.5) * amp + irregular(t) * 0.03;
    energy = 0.55 + u * 0.35;
    temp = 0.5;
  } else if (scene === 3) {
    pos = 0.48 + pulse(t, 0.35) * 0.08;
    energy = 0.2;
    temp = 0.62;
  } else if (scene === 4) {
    const u = (t - 26000) / 5000;
    cameraX = Math.sin(u * Math.PI) * 0.28;
    camera = 0.72 + 0.2 * Math.sin(u * Math.PI);
    pos = 0.4 + pulse(t, 0.28) * 0.08;
    energy = 0.22;
    local = 0.16;
    temp = 0.55;
  } else if (scene === 5) {
    pos = 0.18 + pulse(t, 0.1) * 0.02;
    energy = 0.04;
    local = 0.08;
    temp = 0.36;
  } else if (scene === 6) {
    const u = (t - 33000) / 11000;
    const hz = lerp(1.18, 0.7, u);
    const amp = u < 0.7 ? lerp(0.78, 0.96, u / 0.7) : lerp(0.96, 0.5, (u - 0.7) / 0.3);
    const wave = pulse(t, hz, 1.1);
    const shaped = wave ** 0.85;
    pos = 0.5 + (shaped - 0.5) * amp + irregular(t) * 0.025;
    energy = 0.7 + amp * 0.25;
    temp = 0.58;
  } else {
    const u = (t - 44000) / 4000;
    pos = lerp(0.34, 0.12, u) + pulse(t, 0.15) * 0.02 * (1 - u);
    energy = lerp(0.18, 0.03, u);
    local = 0.12;
    temp = 0.32;
  }

  pos = clamp(pos, 0.04, 0.96);
  const hand = clamp(pos - 0.08 + pulse(t, 0.47, 2.1) * 0.05, 0.02, 0.95);

  const cuts = [8000, 11000, 24000, 26000, 31000, 33000, 44000];
  let cut = 0;
  for (const c of cuts) {
    const d = Math.abs(t - c);
    if (d < 90) cut = Math.max(cut, 1 - d / 90);
  }

  return { pos, hand, energy, cameraX, camera, local, cut, scene, temp };
}

export function buildDemoSamples(): MotionSample[] {
  const step = 1000 / DEMO_HZ;
  const samples: MotionSample[] = [];
  for (let t = 0; t <= DEMO_DURATION_MS; t += step) {
    const p = demoPoseAt(t);
    samples.push({
      t: Math.round(t),
      pos: p.pos,
      energy: p.energy,
      camera: p.camera,
      local: p.local,
      cut: p.cut,
    });
  }
  return samples;
}

export type DemoProject = {
  meta: ProjectMeta;
  samples: MotionSample[];
  flags: ReviewFlag[];
  actions: Action[];
};

export function createDemoProject(): DemoProject {
  const samples = buildDemoSamples();
  const flags = detectFlags(samples);
  const actions = generateActions(samples, STYLES.signature, DEMO_DURATION_MS);
  return {
    meta: {
      title: DEMO_TITLE,
      sourceKind: "demo",
      sourceName: "Built-in demo",
      durationMs: DEMO_DURATION_MS,
    },
    samples,
    flags,
    actions,
  };
}

export function drawDemoFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tMs: number,
  colors: { bg: string; fg: string; accent: string; signal: string },
) {
  const pose = demoPoseAt(tMs);
  ctx.save();
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, w, h);

  const pan = pose.cameraX * w * 0.55;
  ctx.translate(-pan, 0);

  // Receding floor dots
  ctx.fillStyle = "rgba(236,234,230,0.07)";
  const rows = 9;
  const cols = 16;
  for (let r = 0; r < rows; r++) {
    const v = r / (rows - 1);
    const y = h * (0.58 + v * 0.4);
    const scale = lerp(0.55, 1.25, v);
    for (let c = -2; c < cols + 2; c++) {
      const x = ((c + 0.5) / cols) * w * 1.3 - w * 0.15;
      const size = lerp(1.1, 2.4, v);
      ctx.beginPath();
      ctx.arc(x, y, size * scale * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Horizon
  ctx.strokeStyle = "rgba(236,234,230,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-w, h * 0.58);
  ctx.lineTo(w * 2, h * 0.58);
  ctx.stroke();

  const cx = w * 0.5;
  const floor = h * 0.78;
  const top = h * 0.12;
  const y = lerp(floor, top, pose.pos);
  const handY = lerp(floor, top, pose.hand);
  const bodyH = h * 0.28;
  const bodyW = h * 0.09;
  const warm = pose.temp;

  // Reflection
  ctx.save();
  ctx.globalAlpha = 0.18;
  roundCapsule(ctx, cx, floor + (floor - y) * 0.22, bodyW * 0.7, bodyH * 0.35);
  ctx.fillStyle = colors.fg;
  ctx.fill();
  ctx.restore();

  // Bloom
  const bloom = ctx.createRadialGradient(cx, y, bodyW * 0.1, cx, y, bodyH * 1.1);
  bloom.addColorStop(0, `rgba(232,236,240,${0.22 + pose.energy * 0.18})`);
  bloom.addColorStop(0.45, `rgba(142,171,192,${0.1 + warm * 0.08})`);
  bloom.addColorStop(1, "rgba(142,171,192,0)");
  ctx.fillStyle = bloom;
  ctx.beginPath();
  ctx.arc(cx, y, bodyH * 1.1, 0, Math.PI * 2);
  ctx.fill();

  // Capsule
  roundCapsule(ctx, cx, y, bodyW, bodyH);
  const core = ctx.createLinearGradient(cx, y - bodyH / 2, cx, y + bodyH / 2);
  core.addColorStop(0, "rgba(248,249,250,0.95)");
  core.addColorStop(0.45, `rgba(214,222,228,${0.75 + pose.energy * 0.15})`);
  core.addColorStop(1, "rgba(120,140,155,0.55)");
  ctx.fillStyle = core;
  ctx.fill();

  // Specular
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(cx - bodyW * 0.18, y - bodyH * 0.22, bodyW * 0.16, bodyH * 0.18, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // Secondary orb
  ctx.beginPath();
  ctx.arc(cx + bodyW * 1.15, handY + bodyH * 0.12, bodyW * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(200,212,220,${0.35 + pose.energy * 0.25})`;
  ctx.fill();

  ctx.restore();

  // Vignette
  const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.85);
  vig.addColorStop(0, "rgba(10,11,13,0)");
  vig.addColorStop(1, "rgba(10,11,13,0.55)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  if (pose.cut > 0.2) {
    ctx.fillStyle = `rgba(236,234,230,${pose.cut * 0.35})`;
    ctx.fillRect(0, 0, w, h);
  }
}

function roundCapsule(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const r = w / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
