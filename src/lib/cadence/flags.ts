import type { MotionSample, ReviewFlag } from "./types.ts";
import { uid } from "./format.ts";

const MERGE_GAP = 420;

function mergeRuns(
  samples: MotionSample[],
  test: (s: MotionSample) => boolean,
  kind: ReviewFlag["kind"],
  label: string,
  detail: string,
  minMs: number,
): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  let start: MotionSample | null = null;
  let last: MotionSample | null = null;
  const flush = () => {
    if (!start || !last) return;
    const duration = last.t - start.t;
    if (duration < minMs) return;
    flags.push({
      id: uid("f"),
      kind,
      t: start.t,
      duration,
      label,
      detail,
    });
  };
  for (const s of samples) {
    if (test(s)) {
      if (!start) start = s;
      last = s;
    } else if (start && last && s.t - last.t > MERGE_GAP) {
      flush();
      start = null;
      last = null;
    }
  }
  flush();
  return flags;
}

export function detectFlags(samples: MotionSample[]): ReviewFlag[] {
  if (samples.length === 0) return [];
  const flags: ReviewFlag[] = [];

  flags.push(
    ...mergeRuns(
      samples,
      (s) => s.cut > 0.55,
      "cut",
      "Scene transition",
      "Histogram jump — confirm the script should reset or hold across the cut.",
      0,
    ),
  );

  flags.push(
    ...mergeRuns(
      samples,
      (s) => s.camera > 0.42 && s.camera > s.local * 1.15,
      "camera",
      "Possible camera motion",
      "Global flow dominates. Subject motion may be overstated here.",
      380,
    ),
  );

  flags.push(
    ...mergeRuns(
      samples,
      (s) => s.energy < 0.08,
      "inactive",
      "Low motion",
      "Near-still stretch. A hold is usually correct; check it is not a missed beat.",
      900,
    ),
  );

  flags.push(
    ...mergeRuns(
      samples,
      (s) => s.energy > 0.12 && s.local < 0.18 && s.camera < 0.3,
      "uncertain",
      "Uncertain movement",
      "Energy without a clear local cluster. Worth a look.",
      500,
    ),
  );

  const positions = samples.map((s) => s.pos);
  const mean = positions.reduce((a, b) => a + b, 0) / positions.length;
  const variance =
    positions.reduce((a, p) => a + (p - mean) ** 2, 0) / Math.max(1, positions.length);
  const std = Math.sqrt(variance) || 1;
  flags.push(
    ...mergeRuns(
      samples,
      (s) => Math.abs(s.pos - mean) > std * 2.4 && s.energy > 0.2,
      "unusual",
      "Unusual amplitude",
      "This section spikes relative to the rest of the take.",
      240,
    ),
  );

  flags.sort((a, b) => a.t - b.t);
  return flags;
}

export const FLAG_COPY: Record<
  ReviewFlag["kind"],
  { title: string; hint: string }
> = {
  cut: { title: "Cuts", hint: "Scene changes" },
  camera: { title: "Camera", hint: "Likely false motion" },
  uncertain: { title: "Uncertain", hint: "Low confidence" },
  inactive: { title: "Holds", hint: "Little relevant motion" },
  unusual: { title: "Spikes", hint: "Atypical amplitude" },
};
