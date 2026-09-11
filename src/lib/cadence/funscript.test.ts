import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseFunscript, serializeFunscript } from "./funscript.ts";
import { generateActions } from "./generator.ts";
import { findExtrema } from "./signal.ts";
import { computeStats } from "./stats.ts";
import { STYLES } from "./style.ts";
import { createDemoProject } from "./demo.ts";
import type { MotionSample } from "./types.ts";

describe("funscript roundtrip", () => {
  it("parses and serializes actions", () => {
    const raw = serializeFunscript({
      actions: [
        { id: "a", at: 0, pos: 5 },
        { id: "b", at: 1200, pos: 90 },
      ],
      title: "Test",
      durationMs: 2000,
    });
    const parsed = parseFunscript(raw);
    assert.equal(parsed.actions.length, 2);
    assert.equal(parsed.actions[0]!.pos, 5);
    assert.equal(parsed.actions[1]!.at, 1200);
    assert.equal(parsed.title, "Test");
  });

  it("rejects missing actions", () => {
    assert.throws(() => parseFunscript("{}"));
  });
});

describe("extrema", () => {
  it("finds alternating peaks and troughs", () => {
    const values = [0.2, 0.21, 0.8, 0.79, 0.1, 0.11, 0.9, 0.88, 0.2];
    const ex = findExtrema(values, 0.2, 1);
    assert.ok(ex.length >= 3);
    for (let i = 1; i < ex.length; i++) {
      assert.notEqual(ex[i]!.kind, ex[i - 1]!.kind);
    }
  });
});

describe("generator", () => {
  it("locks extrema to sample timing and uses the style range", () => {
    const samples: MotionSample[] = [];
    for (let i = 0; i <= 200; i++) {
      const t = i * 50;
      const pos = 0.5 + 0.4 * Math.sin((t / 1000) * Math.PI * 2 * 0.8);
      samples.push({ t, pos, energy: 0.6, camera: 0, local: 0.6, cut: 0 });
    }
    const actions = generateActions(samples, STYLES.signature, 10_000);
    assert.ok(actions.length > 8);
    const min = Math.min(...actions.map((a) => a.pos));
    const max = Math.max(...actions.map((a) => a.pos));
    assert.ok(min >= 0 && min <= 30);
    assert.ok(max >= 70);
    const stats = computeStats(actions, 10_000);
    assert.ok(stats.upDownRatio > 0.4);
  });
});

describe("demo project", () => {
  it("builds a reviewable session", () => {
    const demo = createDemoProject();
    assert.ok(demo.actions.length > 20);
    assert.ok(demo.samples.length > 100);
    assert.ok(demo.flags.length > 0);
    assert.ok(demo.meta.durationMs === 48_000);
  });
});
