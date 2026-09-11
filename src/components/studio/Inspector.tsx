import { useMemo, useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Lock,
  Unlock,
  RotateCcw,
  Sliders,
  Crosshair,
  Info,
  Flag,
  Check,
  Activity,
  Radio,
  Target,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CALIBRATION_PRESETS,
  PRESET_LIST,
  computeCalibrationVector,
  countCalibratedPoints,
  GROUP_A_IDS,
  GROUP_B_IDS,
  POINT_METADATA,
} from "@/lib/cadence/calibration";
import { FLAG_COPY } from "@/lib/cadence/flags";
import { formatMs, formatTimecode } from "@/lib/cadence/format";
import { amplitudeHistogram, positionHistogram } from "@/lib/cadence/stats";
import { STYLE_LIST } from "@/lib/cadence/style";
import { useScriptStats, useStudio } from "@/lib/cadence/store";
import type {
  CalibrationPresetId,
  FlagKind,
  ReferencePoint,
  ReferencePointId,
} from "@/lib/cadence/types";
import { cn } from "@/lib/utils";

const TABS = ["Calibrate", "Track (Phase 3)", "Review", "Style", "Stats", "Actions"] as const;
type Tab = (typeof TABS)[number];

export function Inspector() {
  const workflowState = useStudio((s) => s.workflowState);
  const isCalibrationLocked = useStudio((s) => s.isCalibrationLocked);
  const isTrackingActive = useStudio((s) => s.isTrackingActive);
  
  // Default to Calibrate or Track depending on workflow progression
  const [tab, setTab] = useState<Tab>(
    workflowState === "phase3_tracking" || isTrackingActive
      ? "Track (Phase 3)"
      : isCalibrationLocked
        ? "Track (Phase 3)"
        : "Calibrate",
  );

  return (
    <aside className="area-inspector flex min-h-0 flex-col border-t border-border bg-surface md:border-t-0 md:border-l">
      <div className="flex items-center gap-1 px-3 pt-3 overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "h-8 rounded-sm px-2.5 text-xs font-medium whitespace-nowrap transition-colors duration-[var(--motion-quick)]",
              tab === t ? "bg-elevated text-fg" : "text-muted hover:text-fg",
              t === "Track (Phase 3)" && isTrackingActive && "text-emerald-400 font-semibold",
            )}
          >
            {t === "Track (Phase 3)" && isTrackingActive ? (
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Track (Phase 3)
              </span>
            ) : (
              t
            )}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {tab === "Calibrate" ? (
          <CalibratePane onProceedToTrack={() => setTab("Track (Phase 3)")} />
        ) : tab === "Track (Phase 3)" ? (
          <TrackingPane onBackToCalibration={() => setTab("Calibrate")} />
        ) : tab === "Review" ? (
          <ReviewPane />
        ) : tab === "Style" ? (
          <StylePane />
        ) : tab === "Stats" ? (
          <StatsPane />
        ) : (
          <ActionsPane />
        )}
      </div>
    </aside>
  );
}

function CalibratePane({ onProceedToTrack }: { onProceedToTrack?: () => void }) {
  const calibrationPoints = useStudio((s) => s.calibrationPoints);
  const activePointId = useStudio((s) => s.activePointId);
  const setActivePointId = useStudio((s) => s.setActivePointId);
  const setReferencePointCoord = useStudio((s) => s.setReferencePointCoord);
  const selectedPresetId = useStudio((s) => s.selectedPresetId);
  const applyCalibrationPreset = useStudio((s) => s.applyCalibrationPreset);
  const isCalibrationLocked = useStudio((s) => s.isCalibrationLocked);
  const confirmCalibration = useStudio((s) => s.confirmCalibration);
  const unlockCalibration = useStudio((s) => s.unlockCalibration);
  const resetCalibrationPoints = useStudio((s) => s.resetCalibrationPoints);
  const workflowState = useStudio((s) => s.workflowState);
  const abRegion = useStudio((s) => s.abRegion);
  const setRegionPoint = useStudio((s) => s.setRegionPoint);
  const confirmAbRegion = useStudio((s) => s.confirmAbRegion);
  const resetAbRegion = useStudio((s) => s.resetAbRegion);
  const playheadMs = useStudio((s) => s.playheadMs);
  const setPlayhead = useStudio((s) => s.setPlayhead);

  const calibratedCount = useMemo(
    () => countCalibratedPoints(calibrationPoints),
    [calibrationPoints],
  );
  const allCalibrated = calibratedCount === 6;

  const vector = useMemo(
    () => computeCalibrationVector(calibrationPoints),
    [calibrationPoints],
  );

  return (
    <div className="enter space-y-5 pb-4">
      {/* Header & Explicit State Badge */}
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-subtle">Phase 2 Foundation</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <h2 className="font-display text-2xl leading-tight text-fg">A–B Calibration</h2>
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[11px] font-medium hairline",
              isCalibrationLocked
                ? "bg-ok/15 text-ok border-ok/30"
                : allCalibrated
                  ? "bg-sky-500/15 text-sky-400 border-sky-500/30"
                  : "bg-amber-500/15 text-amber-400 border-amber-500/30",
            )}
          >
            {isCalibrationLocked ? (
              <>
                <CheckCircle2 className="size-3" />
                <span>PHASE 2 COMPLETE</span>
              </>
            ) : abRegion.confirmed ? (
              <>
                <Crosshair className="size-3 animate-pulse" />
                <span>STEP 2: {calibratedCount}/6 POINTS</span>
              </>
            ) : (
              <>
                <Flag className="size-3 animate-pulse" />
                <span>STEP 1: A–B REGION</span>
              </>
            )}
          </div>
        </div>
        <p className="mt-1 text-xs text-muted">
          Sequential calibration workflow: Define A–B cycle region first, then place reference points A1–A3 and B1–B3.
        </p>
      </div>

      {/* STEP 1: A–B Region Setup */}
      <div className="rounded-lg border border-border bg-elevated/40 p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="flex size-4.5 items-center justify-center rounded-full bg-accent/20 text-accent font-bold text-[10px]">
              1
            </span>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fg">
              A–B Region
            </h3>
          </div>
          {abRegion.confirmed ? (
            <span className="flex items-center gap-1 rounded bg-ok/15 px-1.5 py-0.5 text-[10px] font-medium text-ok">
              <Check className="size-3" /> Confirmed
            </span>
          ) : (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
              Action Required
            </span>
          )}
        </div>

        {/* Point A and Point B Setup Controls */}
        <div className="space-y-2">
          {/* Point A Row */}
          <div className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-surface/80 p-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex size-5 shrink-0 items-center justify-center rounded bg-sky-500/20 text-[10px] font-mono font-bold text-sky-400">
                A
              </span>
              <div className="min-w-0">
                <div className="font-medium text-fg truncate">Upper Crest Frame</div>
                <div className="text-[10px] text-subtle">
                  {abRegion.startMs !== null ? formatTimecode(abRegion.startMs) : "Not established"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {abRegion.startMs !== null && (
                <button
                  type="button"
                  onClick={() => setPlayhead(abRegion.startMs!)}
                  className="rounded px-2 py-1 text-[11px] text-muted hover:bg-elevated hover:text-fg"
                  title="Jump to Point A timestamp"
                >
                  Seek
                </button>
              )}
              <Button
                size="sm"
                variant={abRegion.startMs !== null ? "outline" : "secondary"}
                disabled={abRegion.confirmed}
                onClick={() => setRegionPoint("A")}
                className="h-7 text-xs px-2.5"
              >
                {abRegion.startMs !== null ? "Update A" : "Set Point A"}
              </Button>
            </div>
          </div>

          {/* Point B Row */}
          <div className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-surface/80 p-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex size-5 shrink-0 items-center justify-center rounded bg-amber-500/20 text-[10px] font-mono font-bold text-amber-400">
                B
              </span>
              <div className="min-w-0">
                <div className="font-medium text-fg truncate">Lower Trough Frame</div>
                <div className="text-[10px] text-subtle">
                  {abRegion.endMs !== null ? formatTimecode(abRegion.endMs) : "Not established"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {abRegion.endMs !== null && (
                <button
                  type="button"
                  onClick={() => setPlayhead(abRegion.endMs!)}
                  className="rounded px-2 py-1 text-[11px] text-muted hover:bg-elevated hover:text-fg"
                  title="Jump to Point B timestamp"
                >
                  Seek
                </button>
              )}
              <Button
                size="sm"
                variant={abRegion.endMs !== null ? "outline" : "secondary"}
                disabled={abRegion.confirmed}
                onClick={() => setRegionPoint("B")}
                className="h-7 text-xs px-2.5"
              >
                {abRegion.endMs !== null ? "Update B" : "Set Point B"}
              </Button>
            </div>
          </div>
        </div>

        {/* Confirmation Button or Re-edit Button */}
        {!abRegion.confirmed ? (
          <Button
            size="sm"
            disabled={abRegion.startMs === null || abRegion.endMs === null}
            onClick={confirmAbRegion}
            className="w-full gap-2 bg-accent text-accent-fg text-xs font-medium shadow-sm h-8 disabled:opacity-50"
          >
            <Check className="size-3.5" />
            Confirm A–B Region ({abRegion.startMs !== null && abRegion.endMs !== null ? `${formatTimecode(abRegion.startMs)} – ${formatTimecode(abRegion.endMs)}` : "Set A & B first"})
          </Button>
        ) : (
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-muted">
              Region: {formatTimecode(abRegion.startMs!)} – {formatTimecode(abRegion.endMs!)}
            </span>
            <button
              type="button"
              onClick={resetAbRegion}
              className="text-[11px] text-accent hover:underline"
            >
              Reconfigure Region
            </button>
          </div>
        )}
      </div>

      {/* STEP 2: Reference Points (A1–A3 and B1–B3) */}
      <div className={cn(
        "rounded-lg border border-border bg-elevated/40 p-3.5 space-y-4",
        !abRegion.confirmed && "opacity-50 pointer-events-none select-none",
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="flex size-4.5 items-center justify-center rounded-full bg-accent/20 text-accent font-bold text-[10px]">
              2
            </span>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fg">
              Reference Points
            </h3>
          </div>
          <span className="rounded bg-elevated px-1.5 py-0.5 text-[10px] font-mono text-muted">
            {calibratedCount}/6 Established
          </span>
        </div>

        {!abRegion.confirmed ? (
          <div className="p-3 rounded-md bg-surface text-center text-xs text-subtle">
            Complete Step 1 (Confirm A–B Region) to begin Reference Point setup.
          </div>
        ) : (
          <>
            {/* Primary Action Button */}
            <div>
              {isCalibrationLocked ? (
                <div className="space-y-2">
                  <div className="rounded-md bg-ok/10 border border-ok/25 p-2.5 text-xs text-ok text-center font-medium">
                    Phase 2 Complete: 6 Reference Points Established & Locked.
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={unlockCalibration}
                    className="w-full gap-2 border-border text-xs hover:text-accent"
                  >
                    <Unlock className="size-3.5" />
                    Unlock to Edit Points
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  disabled={calibratedCount < 6}
                  onClick={confirmCalibration}
                  className="w-full gap-2 bg-accent text-accent-fg text-xs font-medium shadow-sm disabled:opacity-50"
                >
                  <Lock className="size-3.5" />
                  {calibratedCount < 6
                    ? `Set All 6 Points (${calibratedCount}/6)`
                    : "Confirm & Lock Calibration (6 Points)"}
                </Button>
              )}
            </div>

            {/* Geometric Presets */}
            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.14em] text-subtle">Presets</p>
                <span className="text-[10px] text-subtle">Geometric · No AI guesswork</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {PRESET_LIST.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={isCalibrationLocked}
                    onClick={() => applyCalibrationPreset(preset.id as CalibrationPresetId)}
                    className={cn(
                      "rounded-md p-2 text-left transition-colors border text-xs",
                      selectedPresetId === preset.id
                        ? "border-accent bg-elevated text-fg font-medium"
                        : "border-border/60 bg-elevated/40 text-muted hover:bg-elevated hover:text-fg disabled:opacity-50",
                    )}
                  >
                    <div className="font-medium leading-snug">{preset.name}</div>
                    <div className="mt-0.5 line-clamp-1 text-[10px] text-subtle">
                      {preset.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Vector Metrics */}
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-subtle">Calibrated Vector Geometry</p>
              <dl className="mt-2 grid grid-cols-3 gap-2">
                <div className="rounded-md bg-surface px-2 py-1.5">
                  <dt className="text-[10px] uppercase tracking-[0.14em] text-subtle">Span</dt>
                  <dd className="mt-0.5 text-xs font-semibold tabular text-fg">
                    {vector.valid ? `${vector.travelSpanY}%` : "—"}
                  </dd>
                </div>
                <div className="rounded-md bg-surface px-2 py-1.5">
                  <dt className="text-[10px] uppercase tracking-[0.14em] text-subtle">Distance</dt>
                  <dd className="mt-0.5 text-xs font-semibold tabular text-fg">
                    {vector.valid ? `${vector.totalDistance}%` : "—"}
                  </dd>
                </div>
                <div className="rounded-md bg-surface px-2 py-1.5">
                  <dt className="text-[10px] uppercase tracking-[0.14em] text-subtle">Angle</dt>
                  <dd className="mt-0.5 text-xs font-semibold tabular text-fg">
                    {vector.valid ? `${vector.angleDeg}°` : "—"}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Group A Points Editor (Upper Limits) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="size-2 rounded-full bg-sky-400" />
                  <p className="text-xs uppercase tracking-[0.14em] font-semibold text-sky-400">
                    Group A: Upper Crest (Frame A)
                  </p>
                </div>
                {abRegion.startMs !== null && (
                  <button
                    type="button"
                    onClick={() => setPlayhead(abRegion.startMs!)}
                    className="text-[10px] text-sky-400 hover:underline"
                  >
                    Jump to Frame A
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                {GROUP_A_IDS.map((id) => (
                  <PointEditorRow
                    key={id}
                    id={id}
                    point={calibrationPoints[id]}
                    isActive={activePointId === id}
                    isLocked={isCalibrationLocked}
                    onSelect={() => setActivePointId(id)}
                    onChange={(x, y) => setReferencePointCoord(id, x, y)}
                  />
                ))}
              </div>
            </div>

            {/* Group B Points Editor (Lower Limits) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="size-2 rounded-full bg-amber-400" />
                  <p className="text-xs uppercase tracking-[0.14em] font-semibold text-amber-400">
                    Group B: Lower Trough (Frame B)
                  </p>
                </div>
                {abRegion.endMs !== null && (
                  <button
                    type="button"
                    onClick={() => setPlayhead(abRegion.endMs!)}
                    className="text-[10px] text-amber-400 hover:underline"
                  >
                    Jump to Frame B
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                {GROUP_B_IDS.map((id) => (
                  <PointEditorRow
                    key={id}
                    id={id}
                    point={calibrationPoints[id]}
                    isActive={activePointId === id}
                    isLocked={isCalibrationLocked}
                    onSelect={() => setActivePointId(id)}
                    onChange={(x, y) => setReferencePointCoord(id, x, y)}
                  />
                ))}
              </div>
            </div>

            {/* Reset Button */}
            <div>
              <Button
                variant="ghost"
                size="sm"
                disabled={isCalibrationLocked}
                onClick={resetCalibrationPoints}
                className="w-full gap-1.5 text-xs text-subtle hover:text-fg"
              >
                <RotateCcw className="size-3" />
                Reset Points to Center Standard
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Tracking Engine Foundation Readiness Notice & Proceed to Phase 3 */}
      <div className="rounded-md border border-border/80 bg-elevated/50 p-3 text-xs space-y-2.5">
        <div className="flex items-center gap-1.5 font-medium text-fg">
          <Info className="size-3.5 text-accent" />
          <span>Tracking Engine Foundation Ready</span>
        </div>
        <p className="text-[11px] leading-relaxed text-muted">
          Reference points A1–A3 and B1–B3 establish the physical travel boundary and vector axis. In
          Phase 3, optical motion tracking algorithms calculate displacement along this
          coordinate frame. Zero fake motion data is generated.
        </p>

        {isCalibrationLocked && onProceedToTrack && (
          <Button
            size="sm"
            onClick={onProceedToTrack}
            className="w-full gap-2 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
          >
            <Activity className="size-3.5" />
            <span>Open Phase 3: Optical Tracking</span>
            <ArrowRight className="size-3.5 ml-auto" />
          </Button>
        )}
      </div>
    </div>
  );
}

function TrackingPane({ onBackToCalibration }: { onBackToCalibration?: () => void }) {
  const isTrackingActive = useStudio((s) => s.isTrackingActive);
  const trackingSettings = useStudio((s) => s.trackingSettings);
  const currentFrame = useStudio((s) => s.currentTrackingFrame);
  const toggleOpticalTracking = useStudio((s) => s.toggleOpticalTracking);
  const setTrackingSettings = useStudio((s) => s.setTrackingSettings);
  const calibrationPoints = useStudio((s) => s.calibrationPoints);
  const isCalibrationLocked = useStudio((s) => s.isCalibrationLocked);
  const playheadMs = useStudio((s) => s.playheadMs);

  const vector = useMemo(
    () => computeCalibrationVector(calibrationPoints),
    [calibrationPoints],
  );

  const { primaryA, primaryB, distance, spanY, angleDeg, active } = currentFrame;
  const hasA = primaryA.x !== null && primaryA.y !== null && primaryA.status === "tracking";
  const hasB = primaryB.x !== null && primaryB.y !== null && primaryB.status === "tracking";

  return (
    <div className="enter space-y-5 pb-6">
      {/* Phase 3 Header & Master Activation */}
      <div>
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.16em] text-subtle">Optical Tracking</p>
          <span className="text-[11px] font-mono text-muted tabular">
            {formatTimecode(playheadMs)}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <h2 className="font-display text-2xl leading-tight text-fg">Primary Points A & B</h2>
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[11px] font-medium hairline",
              isTrackingActive
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                : "bg-surface/80 text-muted border-border/80",
            )}
          >
            {isTrackingActive ? (
              <>
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                <span>TRACKING ACTIVE</span>
              </>
            ) : (
              <>
                <Radio className="size-3 text-subtle" />
                <span>STANDBY / PAUSED</span>
              </>
            )}
          </div>
        </div>
        <p className="mt-1 text-xs text-muted">
          Tracks physical positions of Primary Point A and Primary Point B over time. All calculations anchor to Phase 2 reference points (A1–A3, B1–B3) without conflating them.
        </p>
      </div>

      {/* Calibration Lock Gate Check */}
      {!isCalibrationLocked && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-3 text-xs space-y-2">
          <div className="flex items-center gap-1.5 font-medium text-amber-300">
            <AlertCircle className="size-4 shrink-0 text-amber-400" />
            <span>Phase 2 Calibration Not Locked</span>
          </div>
          <p className="text-[11px] text-amber-200/80 leading-relaxed">
            Optical tracking requires verified spatial reference bounds (A1–A3 and B1–B3) before tracking.
          </p>
          {onBackToCalibration && (
            <Button
              size="sm"
              variant="outline"
              onClick={onBackToCalibration}
              className="w-full text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
            >
              Complete Calibration in Calibrate Tab
            </Button>
          )}
        </div>
      )}

      {/* Master Tracking Switch Button */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={!isCalibrationLocked}
          onClick={toggleOpticalTracking}
          className={cn(
            "flex-1 gap-2 text-xs font-semibold shadow-sm transition-all",
            isTrackingActive
              ? "bg-surface hover:bg-surface/80 border border-border text-fg"
              : "bg-emerald-600 hover:bg-emerald-500 text-white",
          )}
        >
          <Activity className="size-3.5" />
          <span>
            {isTrackingActive ? "Pause Optical Tracking" : "Activate Phase 3 Tracking"}
          </span>
        </Button>
      </div>

      {/* Zero Fabrication & Strict Separation Assurance */}
      <div className="rounded-md border border-border/70 bg-elevated/40 p-2.5 text-xs text-muted space-y-1">
        <div className="flex items-center gap-1.5 text-fg font-medium">
          <ShieldCheck className="size-3.5 text-emerald-400" />
          <span>Strict Physical Tracking Policy</span>
        </div>
        <p className="text-[11px] leading-relaxed">
          If motion features cannot be verified above the confidence threshold, positions are strictly reported as <strong className="text-amber-400 font-medium">Unknown</strong>. No artificial or placeholder funscript motion is ever fabricated.
        </p>
      </div>

      {/* Primary Point A Tracker Card */}
      <div className="rounded-lg border border-sky-500/30 bg-elevated/40 p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-xs bg-sky-500/20 text-sky-300 font-mono text-xs font-bold ring-1 ring-sky-500/40">
              A
            </span>
            <div>
              <h3 className="text-xs font-semibold text-fg">Primary Point A (Crest)</h3>
              <p className="text-[10px] text-muted">Upper motion boundary target</p>
            </div>
          </div>
          <span
            className={cn(
              "rounded px-2 py-0.5 text-[10px] font-mono font-semibold uppercase",
              !isTrackingActive
                ? "bg-surface text-subtle border border-border/60"
                : hasA
                ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                : "bg-amber-500/15 text-amber-400 border border-amber-500/30",
            )}
          >
            {!isTrackingActive ? "Standby" : hasA ? "Tracking" : "Unknown"}
          </span>
        </div>

        {/* Real-time Tracking Readout */}
        <div className="rounded-md border border-border/70 bg-surface/80 p-2.5 space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-subtle font-mono">Current Position</span>
            <span className="font-mono text-sm font-semibold tabular text-fg">
              {hasA ? `X: ${primaryA.x}% · Y: ${primaryA.y}%` : "— Unknown"}
            </span>
          </div>

          {/* Confidence Meter */}
          <div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted">Tracking Confidence</span>
              <span className="font-mono tabular text-xs text-sky-400">
                {isTrackingActive ? `${Math.round(primaryA.confidence * 100)}%` : "0%"}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-elevated">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-150",
                  primaryA.confidence >= 0.7
                    ? "bg-emerald-400"
                    : primaryA.confidence >= 0.4
                    ? "bg-sky-400"
                    : "bg-amber-400/50",
                )}
                style={{ width: `${Math.round(primaryA.confidence * 100)}%` }}
              />
            </div>
          </div>

          {/* Spatial Anchor Reference (Strict Separation) */}
          <div className="border-t border-border/50 pt-2 text-[11px] text-muted space-y-1">
            <div className="flex items-center justify-between">
              <span>Reference Anchor:</span>
              <span className="font-mono text-subtle">
                Group A Centroid ({vector.centroidA.x}%, {vector.centroidA.y}%)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Displacement (Δ):</span>
              <span className="font-mono text-fg tabular">
                {hasA && primaryA.displacement
                  ? `ΔX: ${primaryA.displacement.dx}%, ΔY: ${primaryA.displacement.dy}% (Dist: ${primaryA.displacement.dist}%)`
                  : "— None / Baseline"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Point B Tracker Card */}
      <div className="rounded-lg border border-amber-500/30 bg-elevated/40 p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-xs bg-amber-500/20 text-amber-300 font-mono text-xs font-bold ring-1 ring-amber-500/40">
              B
            </span>
            <div>
              <h3 className="text-xs font-semibold text-fg">Primary Point B (Trough)</h3>
              <p className="text-[10px] text-muted">Lower motion boundary target</p>
            </div>
          </div>
          <span
            className={cn(
              "rounded px-2 py-0.5 text-[10px] font-mono font-semibold uppercase",
              !isTrackingActive
                ? "bg-surface text-subtle border border-border/60"
                : hasB
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "bg-amber-500/15 text-amber-400 border border-amber-500/30",
            )}
          >
            {!isTrackingActive ? "Standby" : hasB ? "Tracking" : "Unknown"}
          </span>
        </div>

        {/* Real-time Tracking Readout */}
        <div className="rounded-md border border-border/70 bg-surface/80 p-2.5 space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-subtle font-mono">Current Position</span>
            <span className="font-mono text-sm font-semibold tabular text-fg">
              {hasB ? `X: ${primaryB.x}% · Y: ${primaryB.y}%` : "— Unknown"}
            </span>
          </div>

          {/* Confidence Meter */}
          <div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted">Tracking Confidence</span>
              <span className="font-mono tabular text-xs text-amber-400">
                {isTrackingActive ? `${Math.round(primaryB.confidence * 100)}%` : "0%"}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-elevated">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-150",
                  primaryB.confidence >= 0.7
                    ? "bg-emerald-400"
                    : primaryB.confidence >= 0.4
                    ? "bg-amber-400"
                    : "bg-amber-400/50",
                )}
                style={{ width: `${Math.round(primaryB.confidence * 100)}%` }}
              />
            </div>
          </div>

          {/* Spatial Anchor Reference (Strict Separation) */}
          <div className="border-t border-border/50 pt-2 text-[11px] text-muted space-y-1">
            <div className="flex items-center justify-between">
              <span>Reference Anchor:</span>
              <span className="font-mono text-subtle">
                Group B Centroid ({vector.centroidB.x}%, {vector.centroidB.y}%)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Displacement (Δ):</span>
              <span className="font-mono text-fg tabular">
                {hasB && primaryB.displacement
                  ? `ΔX: ${primaryB.displacement.dx}%, ΔY: ${primaryB.displacement.dy}% (Dist: ${primaryB.displacement.dist}%)`
                  : "— None / Baseline"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Calculated Optical Geometry vs Calibration Baseline */}
      <div className="rounded-lg border border-border bg-elevated/40 p-3.5 space-y-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fg">
          Live Geometry vs Calibrated Baseline
        </h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md border border-border/60 bg-surface/80 p-2">
            <div className="text-[10px] uppercase text-subtle">Tracked Stroke Span</div>
            <div className="mt-0.5 font-mono text-sm font-semibold tabular text-emerald-400">
              {spanY !== null ? `${spanY}%` : "— Unknown"}
            </div>
            <div className="mt-0.5 text-[10px] text-muted">
              Ref Baseline: {vector.travelSpanY}%
            </div>
          </div>

          <div className="rounded-md border border-border/60 bg-surface/80 p-2">
            <div className="text-[10px] uppercase text-subtle">Vector Distance</div>
            <div className="mt-0.5 font-mono text-sm font-semibold tabular text-fg">
              {distance !== null ? `${distance}%` : "— Unknown"}
            </div>
            <div className="mt-0.5 text-[10px] text-muted">
              Ref Baseline: {vector.totalDistance}%
            </div>
          </div>

          <div className="col-span-2 rounded-md border border-border/60 bg-surface/80 p-2 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase text-subtle">Stroke Vector Angle</div>
              <div className="font-mono text-xs font-semibold tabular text-fg">
                {angleDeg !== null ? `${angleDeg}°` : "— Unknown"}
              </div>
            </div>
            <div className="text-right text-[10px] text-muted">
              <div>Reference Angle: {vector.angleDeg}°</div>
              <div>Alignment: {vector.alignment}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Optical Tracking Parameters & Settings */}
      <div className="rounded-lg border border-border bg-elevated/40 p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fg">
            Tracking Parameters
          </h3>
          <Sliders className="size-3.5 text-muted" />
        </div>

        {/* Confidence Threshold Slider */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Minimum Confidence Threshold</span>
            <span className="font-mono text-fg tabular">
              {Math.round(trackingSettings.minConfidenceThreshold * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="20"
            max="80"
            step="5"
            value={Math.round(trackingSettings.minConfidenceThreshold * 100)}
            onChange={(e) =>
              setTrackingSettings({ minConfidenceThreshold: Number(e.target.value) / 100 })
            }
            className="w-full accent-emerald-500 cursor-pointer"
          />
          <p className="text-[10px] text-subtle">
            Signals below this threshold are strictly reported as Unknown.
          </p>
        </div>

        {/* Search Radius Slider */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Reference Search Window Radius</span>
            <span className="font-mono text-fg tabular">
              ±{trackingSettings.searchRadiusPct}%
            </span>
          </div>
          <input
            type="range"
            min="6"
            max="25"
            step="1"
            value={trackingSettings.searchRadiusPct}
            onChange={(e) =>
              setTrackingSettings({ searchRadiusPct: Number(e.target.value) })
            }
            className="w-full accent-emerald-500 cursor-pointer"
          />
          <p className="text-[10px] text-subtle">
            Optical search radius centered around calibrated centroids A and B.
          </p>
        </div>

        {/* Visual Overlay Toggles */}
        <div className="space-y-1.5 border-t border-border/60 pt-2 text-xs">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-muted">Show Primary Diamond Overlays</span>
            <input
              type="checkbox"
              checked={trackingSettings.showPrimaryOverlay}
              onChange={(e) =>
                setTrackingSettings({ showPrimaryOverlay: e.target.checked })
              }
              className="rounded border-border bg-surface accent-emerald-500"
            />
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-muted">Show Reference Search Windows</span>
            <input
              type="checkbox"
              checked={trackingSettings.showSearchBorders}
              onChange={(e) =>
                setTrackingSettings({ showSearchBorders: e.target.checked })
              }
              className="rounded border-border bg-surface accent-emerald-500"
            />
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-muted">Show Displacement Vectors (Δ)</span>
            <input
              type="checkbox"
              checked={trackingSettings.showDisplacementVectors}
              onChange={(e) =>
                setTrackingSettings({ showDisplacementVectors: e.target.checked })
              }
              className="rounded border-border bg-surface accent-emerald-500"
            />
          </label>
        </div>
      </div>
    </div>
  );
}

type PointEditorRowProps = {
  key?: string;
  id: ReferencePointId;
  point: ReferencePoint;
  isActive: boolean;
  isLocked: boolean;
  onSelect: () => void;
  onChange: (x: number, y: number) => void;
};

function PointEditorRow({
  id,
  point,
  isActive,
  isLocked,
  onSelect,
  onChange,
}: PointEditorRowProps) {
  const meta = POINT_METADATA[id];
  const isA = point.group === "A";
  const isSet = point.set !== false;

  return (
    <div
      onClick={onSelect}
      className={cn(
        "flex items-center justify-between gap-2 rounded-md border p-2 text-xs transition-colors cursor-pointer",
        isActive
          ? isA
            ? "border-sky-500 bg-sky-950/25 text-fg"
            : "border-amber-500 bg-amber-950/25 text-fg"
          : isSet
            ? "border-border/60 bg-surface text-fg hover:bg-surface/80"
            : "border-dashed border-border/50 bg-surface/40 text-muted hover:bg-surface/70",
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
            isA ? "bg-sky-500/20 text-sky-300" : "bg-amber-500/20 text-amber-300",
          )}
        >
          {id}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className="truncate text-fg text-[11px] font-medium">{meta.description}</span>
            {!isSet && (
              <span className="rounded bg-amber-500/15 text-amber-400 px-1 py-0.2 text-[9px]">
                Unset
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-subtle">X</label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            disabled={isLocked}
            value={isSet ? point.x : ""}
            placeholder="—"
            onChange={(e) => {
              const val = Number(e.target.value);
              if (!isNaN(val)) onChange(val, isSet ? point.y : 50);
            }}
            className="w-12 rounded border border-border bg-bg px-1 py-0.5 text-right text-[11px] tabular text-fg disabled:opacity-50"
          />
          <span className="text-[10px] text-subtle">%</span>
        </div>

        <div className="flex items-center gap-1">
          <label className="text-[10px] text-subtle">Y</label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            disabled={isLocked}
            value={isSet ? point.y : ""}
            placeholder="—"
            onChange={(e) => {
              const val = Number(e.target.value);
              if (!isNaN(val)) onChange(isSet ? point.x : 50, val);
            }}
            className="w-12 rounded border border-border bg-bg px-1 py-0.5 text-right text-[11px] tabular text-fg disabled:opacity-50"
          />
          <span className="text-[10px] text-subtle">%</span>
        </div>
      </div>
    </div>
  );
}

function ReviewPane() {
  const flags = useStudio((s) => s.flags);
  const durationMs = useStudio((s) => s.meta.durationMs);
  const setPlayhead = useStudio((s) => s.setPlayhead);
  const playheadMs = useStudio((s) => s.playheadMs);
  const flagged = flags.reduce((s, f) => s + Math.max(f.duration, 80), 0);
  const coverage = durationMs > 0 ? Math.max(0, 1 - flagged / durationMs) : 1;
  const kinds: FlagKind[] = ["cut", "camera", "uncertain", "inactive", "unusual"];

  return (
    <div className="enter">
      <p className="text-xs uppercase tracking-[0.16em] text-subtle">Active learning</p>
      <h2 className="mt-1 font-display text-2xl leading-tight text-fg">
        {Math.round(coverage * 100)}% high confidence
      </h2>
      <p className="mt-1 text-sm text-muted">
        {flags.length === 0
          ? "No review marks on this take."
          : `${flags.length} sections worth a look. Skip the rest.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-subtle">
        {kinds.map((k) => (
          <span key={k}>{FLAG_COPY[k].title}</span>
        ))}
      </div>
      <ul className="mt-4 space-y-1.5">
        {flags.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => setPlayhead(f.t, true)}
              className={cn(
                "flex w-full flex-col rounded-md px-3 py-2.5 text-left transition-colors duration-[var(--motion-quick)]",
                Math.abs(playheadMs - f.t) < 400 ? "bg-elevated" : "hover:bg-elevated/70",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-fg">{f.label}</span>
                <span className="tabular text-xs text-muted">{formatTimecode(f.t, false)}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted">{f.detail}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StylePane() {
  const styleId = useStudio((s) => s.styleId);
  const setStyle = useStudio((s) => s.setStyle);
  const regenerate = useStudio((s) => s.regenerate);
  const samples = useStudio((s) => s.samples);
  const current = useStudio((s) => s.style);

  return (
    <div className="enter">
      <p className="text-xs uppercase tracking-[0.16em] text-subtle">Generator</p>
      <h2 className="mt-1 font-display text-2xl leading-tight">Scripting style</h2>
      <p className="mt-1 text-sm text-muted">
        Motion stays put. Only the conversion layer changes. Re-run without touching the video.
      </p>
      <div className="mt-4 grid gap-2">
        {STYLE_LIST.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStyle(s.id)}
            className={cn(
              "rounded-md px-3 py-2.5 text-left hairline transition-colors duration-[var(--motion-quick)]",
              styleId === s.id ? "bg-elevated" : "bg-transparent hover:bg-elevated/60",
            )}
          >
            <div className="text-sm font-medium text-fg">{s.name}</div>
            <p className="mt-0.5 text-xs text-muted">{s.blurb}</p>
          </button>
        ))}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <Stat label="Range" value={`${current.minPos}–${current.maxPos}`} />
        <Stat label="Up / down" value={`${current.upPoints} / ${current.downPoints}`} />
        <Stat label="Hold" value={formatMs(current.minHoldMs)} />
        <Stat label="Cadence skip" value={`${Math.round(current.cadenceSkip * 100)}%`} />
      </dl>
      <Button className="mt-4 w-full" onClick={regenerate} disabled={samples.length === 0}>
        Regenerate draft
      </Button>
    </div>
  );
}

function StatsPane() {
  const stats = useScriptStats();
  const actions = useStudio((s) => s.actions);
  const amp = amplitudeHistogram(actions);
  const pos = positionHistogram(actions);

  return (
    <div className="enter">
      <p className="text-xs uppercase tracking-[0.16em] text-subtle">Performance shape</p>
      <h2 className="mt-1 font-display text-2xl leading-tight">Script signature</h2>
      <p className="mt-1 text-sm text-muted">
        Characteristics of the current draft — not a score. Use them to stay close to your style.
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="Actions" value={String(stats.actions)} />
        <Stat label="Strokes" value={String(stats.strokes)} />
        <Stat label="Density" value={`${stats.densityPerMin.toFixed(0)} / min`} />
        <Stat label="Mean amp" value={stats.meanAmplitude.toFixed(0)} />
        <Stat label="Median stroke" value={formatMs(stats.medianStrokeMs)} />
        <Stat label="Up/down time" value={stats.upDownRatio.toFixed(2)} />
        <Stat label="Upper share" value={`${Math.round(stats.upperShare * 100)}%`} />
        <Stat label="Lower share" value={`${Math.round(stats.lowerShare * 100)}%`} />
        <Stat label="Holds" value={String(stats.holdCount)} />
        <Stat label="Range used" value={String(stats.rangeUsed)} />
      </dl>
      <p className="mt-5 text-xs uppercase tracking-[0.14em] text-subtle">Amplitude</p>
      <Bars values={amp} />
      <p className="mt-4 text-xs uppercase tracking-[0.14em] text-subtle">Time in position</p>
      <Bars values={pos} />
    </div>
  );
}

function ActionsPane() {
  const actions = useStudio((s) => s.actions);
  const selectedId = useStudio((s) => s.selectedId);
  const select = useStudio((s) => s.select);
  const setPlayhead = useStudio((s) => s.setPlayhead);
  const removeSelected = useStudio((s) => s.removeSelected);

  return (
    <div className="enter">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-2xl leading-tight">{actions.length} actions</h2>
        <Button variant="ghost" size="sm" onClick={removeSelected} disabled={!selectedId}>
          Delete
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted">Click a row to seek. Drag points on the timeline to edit.</p>
      <ul className="mt-3 divide-y divide-border">
        {actions.map((a, i) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => {
                select(a.id);
                setPlayhead(a.at, true);
              }}
              className={cn(
                "flex w-full items-center justify-between px-1 py-2 text-left text-sm tabular",
                a.id === selectedId ? "text-fg" : "text-muted hover:text-fg",
              )}
            >
              <span className="w-8 text-subtle">{i + 1}</span>
              <span>{formatTimecode(a.at)}</span>
              <span>{a.pos}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-elevated px-3 py-2">
      <dt className="text-xs uppercase tracking-[0.14em] text-subtle">{label}</dt>
      <dd className="mt-0.5 tabular text-sm text-fg">{value}</dd>
    </div>
  );
}

function Bars({ values }: { values: number[] }) {
  return (
    <div className="mt-2 flex h-14 items-end gap-1">
      {values.map((v, i) => (
        <div key={i} className="flex h-full flex-1 items-end rounded-xs bg-elevated">
          <div
            className="w-full rounded-xs bg-signal/80"
            style={{ height: `${Math.max(6, v * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
}
