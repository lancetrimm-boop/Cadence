import { useEffect, useMemo, useRef, useState, type PointerEvent as PE } from "react";
import { Lock, Unlock, Sliders, CheckCircle2, AlertCircle, Eye, EyeOff, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CALIBRATION_PRESETS,
  PRESET_LIST,
  computeCalibrationVector,
  countCalibratedPoints,
  areAllPointsCalibrated,
  GROUP_A_IDS,
  GROUP_B_IDS,
  POINT_IDS,
  POINT_METADATA,
} from "@/lib/cadence/calibration";
import { formatTimecode } from "@/lib/cadence/format";
import { useStudio } from "@/lib/cadence/store";
import type { CalibrationPresetId, ReferencePointId } from "@/lib/cadence/types";
import { cn } from "@/lib/utils";

export function ReferenceOverlay() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingPoint, setDraggingPoint] = useState<ReferencePointId | null>(null);
  const [showPresetsMenu, setShowPresetsMenu] = useState(false);

  const calibrationPoints = useStudio((s) => s.calibrationPoints);
  const activePointId = useStudio((s) => s.activePointId);
  const setActivePointId = useStudio((s) => s.setActivePointId);
  const setReferencePointCoord = useStudio((s) => s.setReferencePointCoord);
  const selectedPresetId = useStudio((s) => s.selectedPresetId);
  const applyCalibrationPreset = useStudio((s) => s.applyCalibrationPreset);
  const isCalibrationLocked = useStudio((s) => s.isCalibrationLocked);
  const confirmCalibration = useStudio((s) => s.confirmCalibration);
  const unlockCalibration = useStudio((s) => s.unlockCalibration);
  const showOverlay = useStudio((s) => s.showCalibrationOverlay);
  const toggleOverlay = useStudio((s) => s.toggleCalibrationOverlay);
  const abRegion = useStudio((s) => s.abRegion);
  const setPlayhead = useStudio((s) => s.setPlayhead);
  const playheadMs = useStudio((s) => s.playheadMs);

  const calibratedCount = useMemo(
    () => countCalibratedPoints(calibrationPoints),
    [calibrationPoints],
  );
  const allCalibrated = calibratedCount === 6;

  const vector = useMemo(
    () => computeCalibrationVector(calibrationPoints),
    [calibrationPoints],
  );

  // Click-to-place on video canvas
  const handleContainerPointerDown = (e: PE<HTMLDivElement>) => {
    if (isCalibrationLocked) return;
    if ((e.target as HTMLElement).closest(".pointer-events-auto")) return;
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const nx = Math.round(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)) * 10) / 10;
    const ny = Math.round(Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)) * 10) / 10;

    // Target point to set: active point, or next unset point
    const targetId: ReferencePointId =
      activePointId ??
      (POINT_IDS.find((id) => calibrationPoints[id].set === false) || "A1");

    setReferencePointCoord(targetId, nx, ny);

    // Auto-advance sequence: A1 -> A2 -> A3 -> switch to Frame B -> B1 -> B2 -> B3
    const sequence: ReferencePointId[] = ["A1", "A2", "A3", "B1", "B2", "B3"];
    const currIdx = sequence.indexOf(targetId);
    if (currIdx !== -1 && currIdx < sequence.length - 1) {
      const nextId = sequence[currIdx + 1];
      setActivePointId(nextId);
      // Auto seek to Frame B when completing Group A
      if (targetId === "A3" && abRegion.endMs !== null) {
        setPlayhead(abRegion.endMs);
      }
    }
  };

  // Dragging logic with pointer capture
  const handlePointerDown = (id: ReferencePointId, e: PE<HTMLDivElement>) => {
    if (isCalibrationLocked) return;
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setActivePointId(id);
    setDraggingPoint(id);
  };

  const handlePointerMove = (e: PE<HTMLDivElement>) => {
    if (!draggingPoint || !containerRef.current || isCalibrationLocked) return;
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const nx = Math.round(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)) * 10) / 10;
    const ny = Math.round(Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)) * 10) / 10;
    setReferencePointCoord(draggingPoint, nx, ny);
  };

  const handlePointerUp = (e: PE<HTMLDivElement>) => {
    if (draggingPoint) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Safe fallback
      }
      setDraggingPoint(null);
    }
  };

  // Keyboard navigation for selected point
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isCalibrationLocked || !activePointId) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;

      const step = e.shiftKey ? 2 : 0.5;
      const pt = calibrationPoints[activePointId];
      if (!pt || pt.set === false) return;

      if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        setReferencePointCoord(activePointId, pt.x, pt.y - step);
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        setReferencePointCoord(activePointId, pt.x, pt.y + step);
      } else if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        setReferencePointCoord(activePointId, pt.x - step, pt.y);
      } else if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        setReferencePointCoord(activePointId, pt.x + step, pt.y);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activePointId, isCalibrationLocked, calibrationPoints, setReferencePointCoord]);

  if (!showOverlay) {
    return (
      <div className="absolute top-3 left-3 z-20">
        <Button
          variant="secondary"
          size="sm"
          onClick={toggleOverlay}
          className="gap-1.5 bg-bg/85 backdrop-blur-xs text-xs"
        >
          <Eye className="size-3.5" />
          Show A–B Reference Overlay
        </Button>
      </div>
    );
  }

  // Only consider points that have set: true for drawing lines
  const ptsA = GROUP_A_IDS.map((id) => calibrationPoints[id]).filter((p) => p.set !== false);
  const ptsB = GROUP_B_IDS.map((id) => calibrationPoints[id]).filter((p) => p.set !== false);
  const activeGroup = activePointId ? calibrationPoints[activePointId]?.group : "A";

  return (
    <div
      ref={containerRef}
      onPointerDown={handleContainerPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={cn(
        "absolute inset-0 z-20 select-none overflow-hidden",
        !isCalibrationLocked && "cursor-crosshair",
      )}
    >
      {/* Top Toolbar */}
      <div className="absolute inset-x-0 top-0 z-30 flex flex-wrap items-center justify-between gap-2 p-3 pointer-events-auto">
        <div className="flex flex-wrap items-center gap-2">
          {/* Explicit Status Badge */}
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium backdrop-blur-xs hairline",
              allCalibrated || isCalibrationLocked
                ? "bg-ok/15 text-ok border-ok/30"
                : "bg-amber-500/15 text-amber-400 border-amber-500/30",
            )}
          >
            {isCalibrationLocked ? (
              <>
                <CheckCircle2 className="size-3.5" />
                <span>PHASE 2 COMPLETE: 6 POINTS LOCKED (STOP)</span>
              </>
            ) : allCalibrated ? (
              <>
                <CheckCircle2 className="size-3.5 text-ok" />
                <span>6/6 POINTS ESTABLISHED · READY TO LOCK</span>
              </>
            ) : (
              <>
                <Crosshair className="size-3.5 animate-pulse" />
                <span>
                  STEP 2: SELECT {activePointId || "POINTS"} ({calibratedCount}/6 SET)
                </span>
              </>
            )}
          </div>

          {/* Quick Frame Jump Buttons */}
          {abRegion.startMs !== null && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPlayhead(abRegion.startMs!);
                if (!activePointId || calibrationPoints[activePointId]?.group === "B") {
                  setActivePointId("A1");
                }
              }}
              className={cn(
                "h-7 px-2 text-[11px] bg-bg/80 backdrop-blur-xs gap-1 border-sky-500/40",
                Math.abs(playheadMs - abRegion.startMs) < 40 ? "text-sky-400 border-sky-400 font-bold" : "text-muted",
              )}
              title="Jump to Frame A (Start)"
            >
              <span className="font-bold text-sky-400">Frame A:</span>
              <span>{formatTimecode(abRegion.startMs)}</span>
            </Button>
          )}

          {abRegion.endMs !== null && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPlayhead(abRegion.endMs!);
                if (!activePointId || calibrationPoints[activePointId]?.group === "A") {
                  setActivePointId("B1");
                }
              }}
              className={cn(
                "h-7 px-2 text-[11px] bg-bg/80 backdrop-blur-xs gap-1 border-amber-500/40",
                Math.abs(playheadMs - abRegion.endMs) < 40 ? "text-amber-400 border-amber-400 font-bold" : "text-muted",
              )}
              title="Jump to Frame B (End)"
            >
              <span className="font-bold text-amber-400">Frame B:</span>
              <span>{formatTimecode(abRegion.endMs)}</span>
            </Button>
          )}

          {allCalibrated && (
            <span className="hidden sm:inline rounded-sm bg-bg/75 px-2 py-1 text-[11px] tabular text-muted backdrop-blur-xs">
              Span: {vector.travelSpanY}% · Vector: {vector.angleDeg}°
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Preset Picker Dropdown */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              disabled={isCalibrationLocked}
              onClick={() => setShowPresetsMenu(!showPresetsMenu)}
              className="gap-1.5 bg-bg/80 backdrop-blur-xs text-xs h-7 px-2.5"
            >
              <Sliders className="size-3" />
              Presets
            </Button>

            {showPresetsMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-64 rounded-md border border-border bg-surface p-1.5 shadow-xl backdrop-blur-md z-50">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-subtle">
                  Geometric Starting Presets
                </div>
                <div className="space-y-0.5">
                  {PRESET_LIST.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        applyCalibrationPreset(preset.id as CalibrationPresetId);
                        setShowPresetsMenu(false);
                      }}
                      className={cn(
                        "flex w-full flex-col rounded px-2 py-1.5 text-left text-xs transition-colors",
                        selectedPresetId === preset.id
                          ? "bg-elevated text-fg font-medium"
                          : "text-muted hover:bg-elevated/70 hover:text-fg",
                      )}
                    >
                      <span>{preset.name}</span>
                      <span className="text-[10px] text-subtle">{preset.description}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-1 border-t border-border/50 px-2 pt-1 text-[9px] text-subtle">
                  Standard geometric coordinates · Zero AI guesswork
                </div>
              </div>
            )}
          </div>

          {/* Lock / Unlock Calibration State */}
          {isCalibrationLocked ? (
            <Button
              variant="outline"
              size="sm"
              onClick={unlockCalibration}
              className="gap-1.5 bg-bg/80 backdrop-blur-xs text-xs h-7 px-2.5 hover:text-accent"
            >
              <Unlock className="size-3" />
              Edit Points
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={calibratedCount < 6}
              onClick={confirmCalibration}
              className="gap-1.5 bg-accent text-accent-fg text-xs font-medium shadow-sm h-7 px-3 disabled:opacity-50"
            >
              <Lock className="size-3" />
              {calibratedCount < 6 ? `${calibratedCount}/6 Points` : "Confirm & Lock"}
            </Button>
          )}

          {/* Hide Overlay Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleOverlay}
            className="size-7 p-0 bg-bg/60 backdrop-blur-xs text-muted hover:text-fg"
            title="Hide Overlay"
          >
            <EyeOff className="size-3" />
          </Button>
        </div>
      </div>

      {/* Guide Banner for active point placement */}
      {!isCalibrationLocked && activePointId && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-30">
          <div className="rounded-md border border-border/80 bg-surface/90 px-3 py-1.5 text-xs shadow-lg backdrop-blur-md flex items-center gap-2">
            <span
              className={cn(
                "size-2 rounded-full",
                activeGroup === "A" ? "bg-sky-400" : "bg-amber-400",
              )}
            />
            <span className="text-fg font-medium">
              Place <span className="font-bold">{activePointId}</span>: {POINT_METADATA[activePointId]?.label}
            </span>
            <span className="text-subtle text-[11px]">
              (Click video to set coordinate)
            </span>
          </div>
        </div>
      )}

      {/* SVG Connecting Guidelines and Stroke Vectors */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <defs>
          {/* Cyan Glow for Group A */}
          <filter id="glow-a" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#38bdf8" floodOpacity="0.6" />
          </filter>
          {/* Amber Glow for Group B */}
          <filter id="glow-b" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#f59e0b" floodOpacity="0.6" />
          </filter>
        </defs>

        {/* Group A Line A1 -> A2 -> A3 (only if at least 2 points are placed) */}
        {ptsA.length >= 2 && (
          <polyline
            points={ptsA.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="1.8"
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
            filter="url(#glow-a)"
            className="opacity-80"
          />
        )}

        {/* Group B Line B1 -> B2 -> B3 (only if at least 2 points are placed) */}
        {ptsB.length >= 2 && (
          <polyline
            points={ptsB.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="1.8"
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
            filter="url(#glow-b)"
            className="opacity-80"
          />
        )}

        {/* Central Stroke Vector Axis from Centroid(A) to Centroid(B) */}
        {allCalibrated && (
          <>
            <line
              x1={vector.centroidA.x}
              y1={vector.centroidA.y}
              x2={vector.centroidB.x}
              y2={vector.centroidB.y}
              stroke="currentColor"
              strokeWidth="1.2"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
              className="text-subtle/70"
            />
            <circle
              cx={vector.centroidA.x}
              cy={vector.centroidA.y}
              r="1.2"
              fill="#38bdf8"
              fillOpacity="0.4"
              stroke="#38bdf8"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={vector.centroidB.x}
              cy={vector.centroidB.y}
              r="1.2"
              fill="#f59e0b"
              fillOpacity="0.4"
              stroke="#f59e0b"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>

      {/* Interactive Reference Point Pins (Only render points that are set) */}
      {POINT_IDS.map((id) => {
        const pt = calibrationPoints[id];
        // If not set yet, don't display a phantom pin on the screen
        if (pt.set === false) return null;

        const isGroupA = pt.group === "A";
        const isSelected = activePointId === id;
        const isDragging = draggingPoint === id;

        const colorClasses = isGroupA
          ? {
              ring: isSelected ? "ring-2 ring-sky-400 ring-offset-2 ring-offset-bg" : "",
              bg: "bg-sky-500",
              text: "text-sky-300",
              border: "border-sky-400",
              badge: "bg-sky-950/90 text-sky-200 border-sky-600/60",
            }
          : {
              ring: isSelected ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-bg" : "",
              bg: "bg-amber-500",
              text: "text-amber-300",
              border: "border-amber-400",
              badge: "bg-amber-950/90 text-amber-200 border-amber-600/60",
            };

        return (
          <div
            key={id}
            onPointerDown={(e) => handlePointerDown(id, e)}
            style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
            className={cn(
              "group absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto touch-none",
              isCalibrationLocked ? "cursor-default" : "cursor-grab active:cursor-grabbing",
              isDragging && "scale-110 z-40",
            )}
          >
            {/* Outer Crosshair Ring */}
            <div
              className={cn(
                "relative flex size-8 items-center justify-center rounded-full transition-transform",
                colorClasses.ring,
              )}
            >
              {/* Outer Pulse when selected */}
              {isSelected && (
                <div
                  className={cn(
                    "absolute inset-0 rounded-full animate-ping opacity-30",
                    isGroupA ? "bg-sky-400" : "bg-amber-400",
                  )}
                />
              )}

              {/* Crosshair Lines */}
              <div
                className={cn(
                  "absolute inset-0 rounded-full border border-dashed",
                  colorClasses.border,
                  "bg-bg/60 backdrop-blur-xs",
                )}
              />
              <div
                className={cn(
                  "absolute h-full w-[1px]",
                  isGroupA ? "bg-sky-400/40" : "bg-amber-400/40",
                )}
              />
              <div
                className={cn(
                  "absolute w-full h-[1px]",
                  isGroupA ? "bg-sky-400/40" : "bg-amber-400/40",
                )}
              />

              {/* Center Dot */}
              <div
                className={cn(
                  "size-2.5 rounded-full shadow-sm transition-transform group-hover:scale-125",
                  colorClasses.bg,
                )}
              />
            </div>

            {/* Label Badge */}
            <div
              className={cn(
                "absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-mono font-medium shadow-md backdrop-blur-xs transition-opacity",
                colorClasses.badge,
                isSelected ? "opacity-100 ring-1 ring-white/30" : "opacity-80 group-hover:opacity-100",
              )}
            >
              <span>{id}</span>
              <span className="ml-1 opacity-70">
                {Math.round(pt.x)},{Math.round(pt.y)}
              </span>
            </div>
          </div>
        );
      })}

      {/* Axis Vector Midpoint Span Readout Pill */}
      {allCalibrated && (
        <div
          style={{
            left: `${(vector.centroidA.x + vector.centroidB.x) / 2}%`,
            top: `${(vector.centroidA.y + vector.centroidB.y) / 2}%`,
          }}
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-bg/90 px-2 py-0.5 text-[10px] font-medium tabular text-fg border border-border/70 shadow-md backdrop-blur-xs"
        >
          Span: {vector.travelSpanY}%
        </div>
      )}
    </div>
  );
}
