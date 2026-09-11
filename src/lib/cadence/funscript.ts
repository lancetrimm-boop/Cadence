import type { Action, FunscriptFile } from "./types.ts";
import { clamp, roundPos, uid } from "./format.ts";

export function sortActions(actions: Action[]): Action[] {
  return [...actions].sort((a, b) => a.at - b.at || a.pos - b.pos);
}

export function sanitizeAction(at: number, pos: number, id?: string): Action {
  return {
    id: id ?? uid("a"),
    at: Math.max(0, Math.round(at)),
    pos: roundPos(pos),
  };
}

export function parseFunscript(raw: string): {
  actions: Action[];
  title: string;
  durationMs: number;
} {
  const data = JSON.parse(raw) as FunscriptFile;
  if (!data || !Array.isArray(data.actions)) {
    throw new Error("Not a funscript — missing actions array.");
  }
  const actions = sortActions(
    data.actions.map((a) => sanitizeAction(Number(a.at) || 0, Number(a.pos) || 0)),
  );
  const last = actions[actions.length - 1];
  const durationMs = Math.max(
    last?.at ?? 0,
    Math.round((data.metadata?.duration ?? 0) * 1000),
  );
  return {
    actions,
    title: data.metadata?.title?.trim() || "Imported script",
    durationMs,
  };
}

export function serializeFunscript(opts: {
  actions: Action[];
  title: string;
  durationMs: number;
  inverted?: boolean;
}): string {
  const actions = sortActions(opts.actions).map((a) => ({
    at: a.at,
    pos: clamp(a.pos, 0, 100),
  }));
  const file: FunscriptFile = {
    version: "1.0",
    inverted: opts.inverted ?? false,
    range: 100,
    metadata: {
      creator: "Cadence",
      title: opts.title,
      description: "Candidate script reviewed in Cadence",
      duration: Math.round(opts.durationMs) / 1000,
      notes: "Generated as a reviewable draft. Final artistic decisions stay human.",
    },
    actions,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function interpolatePos(actions: Action[], t: number): number {
  if (actions.length === 0) return 50;
  const sorted = sortActions(actions);
  if (t <= sorted[0]!.at) return sorted[0]!.pos;
  const last = sorted[sorted.length - 1]!;
  if (t >= last.at) return last.pos;
  let lo = 0;
  let hi = sorted.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]!.at <= t) lo = mid;
    else hi = mid;
  }
  const a = sorted[lo]!;
  const b = sorted[hi]!;
  const u = (t - a.at) / (b.at - a.at || 1);
  return a.pos + (b.pos - a.pos) * u;
}

export function downloadText(filename: string, text: string, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "script";
}
