import { useMemo, useRef, type PointerEvent as PE } from "react";
import {
  AlertTriangle,
  Crosshair,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/lib/cadence/store";
import { computeCentroid } from "@/lib/cadence/calibration";
import { cn } from "@/lib/utils";

/**
 * Primary A/B overlay + placement.
 *
 * Coordinate mapping reuses the existing ReferenceOverlay approach:
 * this layer sits inside the zoom/pan transformed container, so
 * getBoundingClientRect already reflects display transform.
 * (clientX - left) / width * 100 → native video-space % (0–100).
 * Points are stored and rendered only in that video-space %.
 */
export function PrimaryTrackingOverlay() {
  const containerRef = useRef<HTMLDivElement>(null);

  const isTrackingActive = useStudio((s) => s.isTrackingActive);
  const trackingSettings = useStudio((s) => s.trackingSettings);
  const currentFrame = useStudio((s) => s.currentTrackingFrame);
  const toggleOpticalTracking = useStudio((s) => s.toggleOpticalTracking);
  const setTrackingSettings = useStudio((s) => s.setTrackingSettings);
  const calibrationPoints = useStudio((s) => s.calibrationPoints);
  const isCalibrationLocked = useStudio((s) => s.isCalibrationLocked);

  // Simplified primary state (placement + live)
  const primaryPointA = useStudio((s) => s.primaryPointA);
  const primaryPointB = useStudio((s) => s.primaryPointB);
  const primarySetupStep = useStudio((s) => s.primarySetupStep);
  const setPrimaryPointCoord = useStudio((s) => s.setPrimaryPointCoord);
  const resetPrimaryPoints = useStudio((s) => s.resetPrimaryPoints);
  const applyCenterPreset = useStudio((s) => s.applyCenterPreset);
  const showCalibrationOverlay = useStudio((s) => s.showCalibrationOverlay);

  const { primaryA, primaryB, spanY } = currentFrame;

  const ptsA = useMemo(
    () => ["A1", "A2", "A3"].map((id) => calibrationPoints[id as "A1" | "A2" | "A3"]).filter(Boolean),
    [calibrationPoints],
  );
  const ptsB = useMemo(
    () => ["B1", "B2", "B3"].map((id) => calibrationPoints[id as "B1" | "B2" | "B3"]).filter(Boolean),
    [calibrationPoints],
  );
  const centroidA = useMemo(() => computeCentroid(ptsA), [ptsA]);
  const centroidB = useMemo(() => computeCentroid(ptsB), [ptsB]);

  // Live tracked positions (engine frame) when actively tracking
  const hasTrackedA =
    isTrackingActive &&
    primaryA.x !== null &&
    primaryA.y !== null &&
    primaryA.status === "tracking";
  const hasTrackedB =
    isTrackingActive &&
    primaryB.x !== null &&
    primaryB.y !== null &&
    primaryB.status === "tracking";

  // Setup / placed positions from simplified primary state (always video-space %)
  const placedA = primaryPointA.set && primaryPointA.x !== null && primaryPointA.y !== null;
  const placedB = primaryPointB.set && primaryPointB.x !== null && primaryPointB.y !== null;

  const isSetupMode =
    primarySetupStep === "set_a" || primarySetupStep === "set_b" || primarySetupStep === "idle";
  const isReady = primarySetupStep === "ready";
  const isRecovery = primarySetupStep === "recovery";

  // Prefer live tracked coords when available; fall back to placed setup coords
  const displayAx = hasTrackedA ? primaryA.x! : placedA ? primaryPointA.x! : null;
  const displayAy = hasTrackedA ? primaryA.y! : placedA ? primaryPointA.y! : null;
  const displayBx = hasTrackedB ? primaryB.x! : placedB ? primaryPointB.x! : null;
  const displayBy = hasTrackedB ? primaryB.y! : placedB ? primaryPointB.y! : null;
  const confA = hasTrackedA ? primaryA.confidence : primaryPointA.confidence;
  const confB = hasTrackedB ? primaryB.confidence : primaryPointB.confidence;

  const r = trackingSettings.searchRadiusPct;

  /** Display → video-space % (same method as ReferenceOverlay; overlay is inside transform). */
  const clientToVideoPercent = (e: PE<HTMLDivElement>): { x: number; y: number } | null => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = Math.round(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)) * 10) / 10;
    const y = Math.round(Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)) * 10) / 10;
    return { x, y };
  };

  const handlePlacementPointerDown = (e: PE<HTMLDivElement>) => {
    // Only capture placement clicks during set_a / set_b
    if (primarySetupStep !== "set_a" && primarySetupStep !== "set_b") return;
    // Do not intercept while calibration overlay is actively capturing clicks
    if (showCalibrationOverlay) return;
    if ((e.target as HTMLElement).closest(".pointer-events-auto")) return;
    if ((e.target as HTMLElement).closest("button")) return;

    const coords = clientToVideoPercent(e);
    if (!coords) return;

    e.stopPropagation();
    if (primarySetupStep === "set_a") {
      setPrimaryPointCoord("A", coords.x, coords.y);
    } else {
      setPrimaryPointCoord("B", coords.x, coords.y);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "absolute inset-0 z-25 select-none overflow-hidden",
        // Enable clicks only while placing A or B (and not in recovery modal / calib overlay)
        (primarySetupStep === "set_a" || primarySetupStep === "set_b") &&
          !showCalibrationOverlay &&
          "cursor-crosshair",
        // Default: pass through to pan / video except interactive children
        primarySetupStep !== "set_a" && primarySetupStep !== "set_b" && "pointer-events-none",
      )}
      onPointerDown={handlePlacementPointerDown}
    >
      {/* ── Setup banner: Set A → Set B → Ready ── */}
      {(isSetupMode || isReady) && !isTrackingActive && !isRecovery && (
        <div className="absolute left-3 top-3 z-30 flex flex-wrap items-center gap-2 pointer-events-auto">
          <div
            className={cn(
              "flex items-center gap-2 rounded-sm border px-3 py-1.5 text-xs shadow-lg backdrop-blur-md",
              primarySetupStep === "set_a" && "border-sky-500/50 bg-sky-950/90",
              primarySetupStep === "set_b" && "border-amber-500/50 bg-amber-950/90",
              isReady && "border-emerald-500/50 bg-emerald-950/90",
              primarySetupStep === "idle" && "border-border/80 bg-bg/90",
            )}
          >
            <Crosshair
              className={cn(
                "size-3.5 shrink-0",
                primarySetupStep === "set_a" && "text-sky-400",
                primarySetupStep === "set_b" && "text-amber-400",
                isReady && "text-emerald-400",
              )}
            />
            <span className="font-mono text-[11px] font-semibold text-fg">
              {primarySetupStep === "set_a" && "Set Primary Point A"}
              {primarySetupStep === "set_b" && "Set Primary Point B"}
              {isReady && "Ready to Track"}
              {primarySetupStep === "idle" && "Primary Points"}
            </span>
            {primarySetupStep === "set_a" && (
              <span className="text-[11px] text-muted">Click the video to place crest / upper point</span>
            )}
            {primarySetupStep === "set_b" && (
              <span className="text-[11px] text-muted">Click the video to place trough / lower point</span>
            )}
            {isReady && (
              <Button
                variant="outline"
                size="sm"
                onClick={toggleOpticalTracking}
                className="h-6 px-2 text-[10px] border-emerald-500/50 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20"
              >
                Start Tracking
              </Button>
            )}
          </div>
          {(placedA || placedB) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetPrimaryPoints}
              className="h-7 px-2 text-[10px] text-muted hover:text-fg"
              title="Clear primary points and start over"
            >
              Reset A/B
            </Button>
          )}
          {!placedA && !placedB && (
            <Button
              variant="ghost"
              size="sm"
              onClick={applyCenterPreset}
              className="h-7 px-2 text-[10px] text-muted hover:text-fg"
              title="Apply center preset (dev/demo shortcut)"
            >
              Center preset
            </Button>
          )}
        </div>
      )}

      {/* ── Active tracking HUD (existing Phase 3 banner) ── */}
      <div className="absolute right-3 top-3 z-30 flex flex-wrap items-center gap-2 pointer-events-auto">
        {isTrackingActive ? (
          <div className="flex items-center gap-2 rounded-sm border border-emerald-500/40 bg-bg/90 px-3 py-1.5 text-xs shadow-lg backdrop-blur-md">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="font-mono text-[11px] font-semibold text-emerald-400">
              TRACKING ACTIVE
            </span>
            <div className="h-3 w-px bg-border/80" />
            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className={cn(hasTrackedA ? "text-sky-300" : "text-amber-400/80")}>
                A:{" "}
                {hasTrackedA
                  ? `${primaryA.x}%, ${primaryA.y}% (${Math.round(primaryA.confidence * 100)}%)`
                  : "UNKNOWN"}
              </span>
              <span className={cn(hasTrackedB ? "text-amber-300" : "text-amber-400/80")}>
                B:{" "}
                {hasTrackedB
                  ? `${primaryB.x}%, ${primaryB.y}% (${Math.round(primaryB.confidence * 100)}%)`
                  : "UNKNOWN"}
              </span>
              {spanY !== null && (
                <span className="text-fg font-medium">
                  Span: <span className="tabular text-emerald-400">{spanY}%</span>
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleOpticalTracking}
              className="h-6 px-1.5 text-[10px] text-muted hover:text-fg"
              title="Pause Optical Tracking"
            >
              Pause
            </Button>
          </div>
        ) : isReady ? null : null}
      </div>

      {/* ── Placed / tracked Primary A marker (video-space %) ── */}
      {displayAx !== null && displayAy !== null && (
        <div
          style={{ left: `${displayAx}%`, top: `${displayAy}%` }}
          className="group absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none touch-none z-30"
        >
          <div className="relative flex size-9 items-center justify-center">
            <div className="absolute inset-1 rotate-45 rounded-xs border-2 border-sky-400 bg-sky-500/20 shadow-[0_0_12px_rgba(56,189,248,0.6)] backdrop-blur-xs" />
            <div className="relative size-2.5 rotate-45 rounded-xs bg-white shadow-sm ring-2 ring-sky-400" />
          </div>
          <div className="absolute left-1/2 bottom-full mb-1.5 -translate-x-1/2 whitespace-nowrap rounded border border-sky-400/80 bg-sky-950/95 px-2 py-0.5 font-mono text-[10px] font-bold text-sky-200 shadow-xl backdrop-blur-md">
            <span>PRIMARY A</span>
            {(isTrackingActive || confA > 0) && (
              <span className="ml-1.5 rounded-xs bg-sky-500/30 px-1 text-[9px] text-sky-300">
                {Math.round(confA * 100)}%
              </span>
            )}
            <div className="text-[9px] font-normal text-sky-400/80 tabular">
              {displayAx}%, {displayAy}%
            </div>
          </div>
        </div>
      )}

      {/* ── Placed / tracked Primary B marker (video-space %) ── */}
      {displayBx !== null && displayBy !== null && (
        <div
          style={{ left: `${displayBx}%`, top: `${displayBy}%` }}
          className="group absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none touch-none z-30"
        >
          <div className="relative flex size-9 items-center justify-center">
            <div className="absolute inset-1 rotate-45 rounded-xs border-2 border-amber-400 bg-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.6)] backdrop-blur-xs" />
            <div className="relative size-2.5 rotate-45 rounded-xs bg-white shadow-sm ring-2 ring-amber-400" />
          </div>
          <div className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded border border-amber-400/80 bg-amber-950/95 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-200 shadow-xl backdrop-blur-md">
            <span>PRIMARY B</span>
            {(isTrackingActive || confB > 0) && (
              <span className="ml-1.5 rounded-xs bg-amber-500/30 px-1 text-[9px] text-amber-300">
                {Math.round(confB * 100)}%
              </span>
            )}
            <div className="text-[9px] font-normal text-amber-400/80 tabular">
              {displayBx}%, {displayBy}%
            </div>
          </div>
        </div>
      )}

      {/* ── A–B vector while both placed (setup or tracking) ── */}
      {displayAx !== null && displayAy !== null && displayBx !== null && displayBy !== null && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full z-20">
          <line
            x1={`${displayAx}%`}
            y1={`${displayAy}%`}
            x2={`${displayBx}%`}
            y2={`${displayBy}%`}
            stroke="#10b981"
            strokeWidth="2"
            className="opacity-80"
          />
        </svg>
      )}

      {/* ── Active tracking extras: ROIs / displacement (legacy frame + calib centroids) ── */}
      {isTrackingActive && trackingSettings.showPrimaryOverlay && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full z-20">
          <defs>
            <filter id="primary-glow-a" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#38bdf8" floodOpacity="0.8" />
            </filter>
            <filter id="primary-glow-b" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#f59e0b" floodOpacity="0.8" />
            </filter>
          </defs>

          {trackingSettings.showSearchBorders && isCalibrationLocked && (
            <>
              <rect
                x={`${centroidA.x - r}%`}
                y={`${centroidA.y - r}%`}
                width={`${r * 2}%`}
                height={`${r * 2}%`}
                fill="rgba(56, 189, 248, 0.03)"
                stroke="#38bdf8"
                strokeWidth="1"
                strokeDasharray="4 4"
                className="opacity-40"
              />
              <rect
                x={`${centroidB.x - r}%`}
                y={`${centroidB.y - r}%`}
                width={`${r * 2}%`}
                height={`${r * 2}%`}
                fill="rgba(245, 158, 11, 0.03)"
                stroke="#f59e0b"
                strokeWidth="1"
                strokeDasharray="4 4"
                className="opacity-40"
              />
            </>
          )}

          {trackingSettings.showDisplacementVectors && hasTrackedA && (
            <line
              x1={`${centroidA.x}%`}
              y1={`${centroidA.y}%`}
              x2={`${primaryA.x}%`}
              y2={`${primaryA.y}%`}
              stroke="#38bdf8"
              strokeWidth="1.2"
              strokeDasharray="2 2"
              className="opacity-70"
            />
          )}
          {trackingSettings.showDisplacementVectors && hasTrackedB && (
            <line
              x1={`${centroidB.x}%`}
              y1={`${centroidB.y}%`}
              x2={`${primaryB.x}%`}
              y2={`${primaryB.y}%`}
              stroke="#f59e0b"
              strokeWidth="1.2"
              strokeDasharray="2 2"
              className="opacity-70"
            />
          )}
        </svg>
      )}

      {isTrackingActive && hasTrackedA && hasTrackedB && spanY !== null && (
        <div
          style={{
            left: `${(primaryA.x! + primaryB.x!) / 2}%`,
            top: `${(primaryA.y! + primaryB.y!) / 2}%`,
          }}
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-500/70 bg-emerald-950/90 px-2.5 py-0.5 font-mono text-[10px] font-semibold tabular text-emerald-300 shadow-lg backdrop-blur-md z-30"
        >
          Tracked Span: {spanY}%
        </div>
      )}

      {isTrackingActive && (!hasTrackedA || !hasTrackedB) && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-30">
          <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-bg/95 px-3 py-2 text-xs shadow-xl backdrop-blur-md">
            <AlertTriangle className="size-4 text-amber-400 shrink-0" />
            <div>
              <p className="font-medium text-fg">
                {!hasTrackedA && !hasTrackedB
                  ? "Positions for Primary Points A & B are currently unknown."
                  : !hasTrackedA
                    ? "Position for Primary Point A is currently unknown."
                    : "Position for Primary Point B is currently unknown."}
              </p>
              <p className="text-[11px] text-muted">
                Confidence is below threshold or out of search bounds. Zero synthetic motion data is generated.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Setup-mode hint when waiting for first click */}
      {primarySetupStep === "set_a" && !showCalibrationOverlay && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
          <div className="flex items-center gap-2 rounded-lg border border-sky-500/30 bg-bg/70 px-4 py-2.5 text-xs text-sky-200 shadow-xl backdrop-blur-sm">
            <Target className="size-4 text-sky-400" />
            <span>Click anywhere on the video to place <strong className="text-sky-300">Primary Point A</strong></span>
          </div>
        </div>
      )}
      {primarySetupStep === "set_b" && !showCalibrationOverlay && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-bg/70 px-4 py-2.5 text-xs text-amber-200 shadow-xl backdrop-blur-sm">
            <Target className="size-4 text-amber-400" />
            <span>Click anywhere on the video to place <strong className="text-amber-300">Primary Point B</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}
