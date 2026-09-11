import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  areAllPointsCalibrated,
  computeCalibrationVector,
  createDefaultPoints,
  createUnsetPoints,
} from "./calibration.ts";
import { useStudio } from "./store.ts";
import type { ReferencePointId } from "./types.ts";

describe("Phase 2: A–B Workflow & Reference Points Foundation", () => {
  it("initializes without default scripts or fake motion data", () => {
    const state = useStudio.getState();
    assert.deepEqual(state.actions, [], "No default actions should be loaded");
    assert.deepEqual(state.samples, [], "No fake motion samples should be loaded");
    assert.deepEqual(state.flags, [], "No fake review flags should be loaded");
    assert.equal(state.analysis, null, "No analysis should be running automatically");
    assert.equal(state.workflowState, "unloaded");
    assert.equal(state.isCalibrationLocked, false);
    assert.equal(state.calibrationPoints.A2.set, false, "Reference points start unset");
  });

  it("requires exactly 6 reference points: A1, A2, A3, B1, B2, B3", () => {
    const points = createDefaultPoints();
    const keys = Object.keys(points) as ReferencePointId[];
    assert.equal(keys.length, 6);
    for (const id of ["A1", "A2", "A3", "B1", "B2", "B3"] as const) {
      assert.ok(points[id], `Missing required reference point ${id}`);
      assert.equal(points[id].set, true);
      assert.ok(points[id].x >= 0 && points[id].x <= 100);
      assert.ok(points[id].y >= 0 && points[id].y <= 100);
    }
    assert.equal(areAllPointsCalibrated(points), true);
  });

  it("computes centroids and calibration vector metrics accurately", () => {
    const points = createDefaultPoints();
    const vector = computeCalibrationVector(points);

    // Centroid A: A1(44, 25), A2(50, 20), A3(56, 25) -> X=50, Y=23.3
    assert.equal(vector.centroidA.x, 50);
    assert.equal(vector.centroidA.y, 23.3);

    // Centroid B: B1(44, 75), B2(50, 80), B3(56, 75) -> X=50, Y=76.7
    assert.equal(vector.centroidB.x, 50);
    assert.equal(vector.centroidB.y, 76.7);

    // Span: 76.7 - 23.3 = 53.4%
    assert.equal(vector.travelSpanY, 53.4);
    assert.equal(vector.angleDeg, 0, "Vertical stroke should have 0° deviation");
  });

  it("supports presets without pretending AI recognition exists", () => {
    const store = useStudio.getState();
    store.unlockCalibration();
    store.applyCalibrationPreset("wide_span");

    const state = useStudio.getState();
    assert.equal(state.selectedPresetId, "wide_span");
    assert.equal(state.calibrationPoints.A2.y, 10);
    assert.equal(state.calibrationPoints.B2.y, 90);
    assert.equal(state.workflowState, "phase2_complete");
    assert.equal(state.isCalibrationLocked, true);

    const wideVector = computeCalibrationVector(state.calibrationPoints);
    assert.ok(wideVector.travelSpanY > 70, "Wide span should have >70% travel span");

    store.unlockCalibration();
    store.applyCalibrationPreset("diagonal_right");
    const diagState = useStudio.getState();
    const diagVector = computeCalibrationVector(diagState.calibrationPoints);
    assert.notEqual(diagVector.angleDeg, 0, "Diagonal preset should have non-zero angle");
  });

  it("updates individual reference points and clamps out-of-bounds inputs", () => {
    const store = useStudio.getState();
    store.unlockCalibration();
    store.setReferencePointCoord("A2", 150, -20);

    const state = useStudio.getState();
    assert.equal(state.calibrationPoints.A2.x, 100, "X should be clamped to 100");
    assert.equal(state.calibrationPoints.A2.y, 0, "Y should be clamped to 0");
    assert.equal(state.activePointId, "A2");
    // Remaining points stay calibrated, so the store re-locks as phase2_complete.
    assert.equal(state.workflowState, "phase2_complete");
  });

  it("enforces explicit workflow states: reference_setup -> phase2_complete (locked)", () => {
    const store = useStudio.getState();
    store.unlockCalibration();
    store.applyCalibrationPreset("vertical_center");
    store.confirmCalibration();

    let state = useStudio.getState();
    assert.equal(state.isCalibrationLocked, true);
    assert.equal(state.workflowState, "phase2_complete");

    const origA1 = state.calibrationPoints.A1;
    store.setReferencePointCoord("A1", 10, 10);
    state = useStudio.getState();
    assert.equal(state.calibrationPoints.A1.x, origA1.x, "Should not move while locked");

    store.unlockCalibration();
    state = useStudio.getState();
    assert.equal(state.isCalibrationLocked, false);
    assert.equal(state.workflowState, "reference_setup");
  });

  it("resets calibration points to unset placeholders, not filled vertical-center coords", () => {
    const store = useStudio.getState();
    store.unlockCalibration();
    store.applyCalibrationPreset("wide_span");
    store.resetCalibrationPoints();

    const state = useStudio.getState();
    const unset = createUnsetPoints();
    assert.equal(state.selectedPresetId, "vertical_center");
    assert.equal(state.calibrationPoints.A2.y, unset.A2.y);
    assert.equal(state.calibrationPoints.B2.y, unset.B2.y);
    assert.equal(state.calibrationPoints.A2.set, false);
    assert.equal(state.calibrationPoints.B2.set, false);
    assert.equal(areAllPointsCalibrated(state.calibrationPoints), false);
    assert.equal(state.isCalibrationLocked, false);
    assert.equal(state.workflowState, "media_loaded");
  });
});
