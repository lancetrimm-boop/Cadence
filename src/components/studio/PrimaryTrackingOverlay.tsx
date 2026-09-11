import { useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  Eye,
  EyeOff,
  Radio,
  Sliders,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/lib/cadence/store";
import { computeCentroid } from "@/lib/cadence/calibration";
import { cn } from "@/lib/utils";

export function PrimaryTrackingOverlay() {
  const isTrackingActive = useStudio((s) => s.isTrackingActive);
  const trackingSettings = useStudio((s) => s.trackingSettings);
  const currentFrame = useStudio((s) => s.currentTrackingFrame);
  const toggleOpticalTracking = useStudio((s) => s.toggleOpticalTracking);
  const setTrackingSettings = useStudio((s) => s.setTrackingSettings);
  const calibrationPoints = useStudio((s) => s.calibrationPoints);
  const isCalibrationLocked = useStudio((s) => s.isCalibrationLocked);

  const { primaryA, primaryB, distance, spanY, active, status } = currentFrame;

  // Calibrated Reference Centroids
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

  const hasA = primaryA.x !== null && primaryA.y !== null && primaryA.status === "tracking";
  const hasB = primaryB.x !== null && primaryB.y !== null && primaryB.status === "tracking";

  // Radius in % for search ROI boxes
  const r = trackingSettings.searchRadiusPct;

  return (
    <div className="pointer-events-none absolute inset-0 z-25 select-none overflow-hidden">
      {/* Top HUD: Tracking State Status Banner */}
      <div className="absolute right-3 top-3 z-30 flex flex-wrap items-center gap-2 pointer-events-auto">
        {isTrackingActive ? (
          <div className="flex items-center gap-2 rounded-sm border border-emerald-500/40 bg-bg/90 px-3 py-1.5 text-xs shadow-lg backdrop-blur-md">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="font-mono text-[11px] font-semibold text-emerald-400">
              PHASE 3: TRACKING ACTIVE
            </span>
            <div className="h-3 w-px bg-border/80" />
            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className={cn(hasA ? "text-sky-300" : "text-amber-400/80")}>
                A: {hasA ? `${primaryA.x}%, ${primaryA.y}% (${Math.round(primaryA.confidence * 100)}%)` : "UNKNOWN"}
              </span>
              <span className={cn(hasB ? "text-amber-300" : "text-amber-400/80")}>
                B: {hasB ? `${primaryB.x}%, ${primaryB.y}% (${Math.round(primaryB.confidence * 100)}%)` : "UNKNOWN"}
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
        ) : (
          <div className="flex items-center gap-2 rounded-sm border border-border/80 bg-bg/80 px-2.5 py-1 text-xs shadow-md backdrop-blur-md">
            <span className="size-2 rounded-full bg-subtle/50" />
            <span className="text-[11px] text-muted">
              Optical Tracking: <span className="text-subtle">STANDBY (DATA UNAVAILABLE)</span>
            </span>
            {isCalibrationLocked && (
              <Button
                variant="outline"
                size="sm"
                onClick={toggleOpticalTracking}
                className="h-6 px-2 text-[10px] text-accent border-accent/40 bg-accent/10 hover:bg-accent/20"
              >
                Start Phase 3 Track
              </Button>
            )}
          </div>
        )}
      </div>

      {/* SVG Layer for Primary Vector, Search ROIs, and Displacements */}
      {isTrackingActive && trackingSettings.showPrimaryOverlay && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          <defs>
            <filter id="primary-glow-a" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#38bdf8" floodOpacity="0.8" />
            </filter>
            <filter id="primary-glow-b" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#f59e0b" floodOpacity="0.8" />
            </filter>
          </defs>

          {/* Search ROIs anchored to Reference Centroids */}
          {trackingSettings.showSearchBorders && (
            <>
              {/* ROI A around Reference Centroid A */}
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
              {/* ROI B around Reference Centroid B */}
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

          {/* Displacement Vector from Ref Centroid A to Primary Point A */}
          {trackingSettings.showDisplacementVectors && hasA && (
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

          {/* Displacement Vector from Ref Centroid B to Primary Point B */}
          {trackingSettings.showDisplacementVectors && hasB && (
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

          {/* Primary Stroke Vector between Primary A and Primary B (Solid, prominent) */}
          {hasA && hasB && (
            <>
              <line
                x1={`${primaryA.x}%`}
                y1={`${primaryA.y}%`}
                x2={`${primaryB.x}%`}
                y2={`${primaryB.y}%`}
                stroke="#10b981"
                strokeWidth="2.4"
                className="opacity-90"
              />
            </>
          )}
        </svg>
      )}

      {/* Primary Point A Dynamic Diamond Target (Only rendered when position is determined) */}
      {isTrackingActive && trackingSettings.showPrimaryOverlay && hasA && (
        <div
          style={{ left: `${primaryA.x}%`, top: `${primaryA.y}%` }}
          className="group absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto touch-none z-30"
        >
          {/* Diamond Reticle */}
          <div className="relative flex size-9 items-center justify-center">
            {/* Outer Rotating/Pulsing Diamond Halo */}
            <div className="absolute inset-1 rotate-45 rounded-xs border-2 border-sky-400 bg-sky-500/20 shadow-[0_0_12px_rgba(56,189,248,0.6)] backdrop-blur-xs" />
            {/* Center Core */}
            <div className="relative size-2.5 rotate-45 rounded-xs bg-white shadow-sm ring-2 ring-sky-400" />
          </div>

          {/* Primary Label Tag */}
          <div className="absolute left-1/2 bottom-full mb-1.5 -translate-x-1/2 whitespace-nowrap rounded border border-sky-400/80 bg-sky-950/95 px-2 py-0.5 font-mono text-[10px] font-bold text-sky-200 shadow-xl backdrop-blur-md">
            <span>PRIMARY POINT A</span>
            <span className="ml-1.5 rounded-xs bg-sky-500/30 px-1 py-0.2 text-[9px] text-sky-300">
              {Math.round(primaryA.confidence * 100)}% Conf
            </span>
            <div className="text-[9px] font-normal text-sky-400/80 tabular">
              {primaryA.x}%, {primaryA.y}%
              {primaryA.displacement && ` (Δ ${primaryA.displacement.dist}%)`}
            </div>
          </div>
        </div>
      )}

      {/* Primary Point B Dynamic Diamond Target (Only rendered when position is determined) */}
      {isTrackingActive && trackingSettings.showPrimaryOverlay && hasB && (
        <div
          style={{ left: `${primaryB.x}%`, top: `${primaryB.y}%` }}
          className="group absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto touch-none z-30"
        >
          {/* Diamond Reticle */}
          <div className="relative flex size-9 items-center justify-center">
            {/* Outer Rotating/Pulsing Diamond Halo */}
            <div className="absolute inset-1 rotate-45 rounded-xs border-2 border-amber-400 bg-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.6)] backdrop-blur-xs" />
            {/* Center Core */}
            <div className="relative size-2.5 rotate-45 rounded-xs bg-white shadow-sm ring-2 ring-amber-400" />
          </div>

          {/* Primary Label Tag */}
          <div className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded border border-amber-400/80 bg-amber-950/95 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-200 shadow-xl backdrop-blur-md">
            <span>PRIMARY POINT B</span>
            <span className="ml-1.5 rounded-xs bg-amber-500/30 px-1 py-0.2 text-[9px] text-amber-300">
              {Math.round(primaryB.confidence * 100)}% Conf
            </span>
            <div className="text-[9px] font-normal text-amber-400/80 tabular">
              {primaryB.x}%, {primaryB.y}%
              {primaryB.displacement && ` (Δ ${primaryB.displacement.dist}%)`}
            </div>
          </div>
        </div>
      )}

      {/* Primary Vector Midpoint Live Span Chip */}
      {isTrackingActive && hasA && hasB && spanY !== null && (
        <div
          style={{
            left: `${(primaryA.x! + primaryB.x!) / 2}%`,
            top: `${(primaryA.y! + primaryB.y!) / 2}%`,
          }}
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-500/70 bg-emerald-950/90 px-2.5 py-0.5 font-mono text-[10px] font-semibold tabular text-emerald-300 shadow-lg backdrop-blur-md"
        >
          Tracked Span: {spanY}%
        </div>
      )}

      {/* Floating Status Warning when Optical Tracking is active but points are unknown (No fake data) */}
      {isTrackingActive && (!hasA || !hasB) && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-30">
          <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-bg/95 px-3 py-2 text-xs shadow-xl backdrop-blur-md">
            <AlertTriangle className="size-4 text-amber-400 shrink-0" />
            <div>
              <p className="font-medium text-fg">
                {!hasA && !hasB
                  ? "Positions for Primary Points A & B are currently unknown."
                  : !hasA
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
    </div>
  );
}
