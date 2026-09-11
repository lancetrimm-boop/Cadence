import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { useStudio } from "./store.ts";

describe("Phase 1: UX Foundation state transitions", () => {
  it("initializes with activeView set to home", () => {
    const state = useStudio.getState();
    assert.equal(state.activeView, "home");
  });

  it("transitions to studio on resetDemo (Explore Demo)", () => {
    const s = useStudio.getState();
    s.setActiveView("home");
    assert.equal(useStudio.getState().activeView, "home");

    s.resetDemo();
    const after = useStudio.getState();
    assert.equal(after.activeView, "studio");
    assert.equal(after.actions.length, 0);
    assert.equal(after.meta.sourceKind, "demo");
  });

  it("transitions to studio on importScript (Open Funscript)", () => {
    const s = useStudio.getState();
    s.setActiveView("home");
    assert.equal(useStudio.getState().activeView, "home");

    const sampleFunscript = JSON.stringify({
      version: "1.0",
      inverted: false,
      range: 100,
      actions: [
        { at: 100, pos: 10 },
        { at: 500, pos: 90 },
      ],
    });

    s.importScript(sampleFunscript, "sample.funscript");
    const after = useStudio.getState();
    assert.equal(after.activeView, "studio");
    assert.equal(after.actions.length, 2);
    assert.equal(after.meta.sourceName, "sample.funscript");
  });

  it("allows switching back to home and resuming studio", () => {
    const s = useStudio.getState();
    s.setActiveView("home");
    assert.equal(useStudio.getState().activeView, "home");

    s.setActiveView("studio");
    assert.equal(useStudio.getState().activeView, "studio");
  });
});
