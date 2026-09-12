import React, { useState, useRef, useEffect, useCallback } from "react";
import { RotateCw, Magnet, Check, Eye, EyeOff } from "lucide-react";
import { useStudio } from "@/lib/cadence/store";
import { clamp } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  currentPos: number; // 0 to 100 current physical motion position
};

type DragMode = "move" | "resize-tl" | "resize-tr" | "resize-bl" | "resize-br" | "rotate" | null;

export function InteractiveIndicatorOverlay({ containerRef, currentPos }: Props) {
  const indicator = useStudio((s) => s.indicator);
  const updateIndicator = useStudio((s) => s.updateIndicator);
  const snapIndicatorToPoints = useStudio((s) => s.snapIndicatorToPoints);
  const primaryPointA = useStudio((s) => s.primaryPointA);
  const primaryPointB = useStudio((s) => s.primaryPointB);

  const [dragMode, setDragMode] = useState<DragMode>(null);
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    initX: number;
    initY: number;
    initW: number;
    initH: number;
    initRot: number;
  } | null>(null);

  if (!indicator.enabled) return null;

  const handlePointerDown = (mode: DragMode, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!indicator.selected) {
      updateIndicator({ selected: true });
    }

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: indicator.x,
      initY: indicator.y,
      initW: indicator.width,
      initH: indicator.height,
      initRot: indicator.rotation,
    };
    setDragMode(mode);
  };

  useEffect(() => {
    if (!dragMode) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!dragStartRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dxPx = e.clientX - dragStartRef.current.startX;
      const dyPx = e.clientY - dragStartRef.current.startY;

      const dxPct = (dxPx / rect.width) * 100;
      const dyPct = (dyPx / rect.height) * 100;

      const { initX, initY, initW, initH, initRot } = dragStartRef.current;

      if (dragMode === "move") {
        updateIndicator({
          x: clamp(Math.round((initX + dxPct) * 10) / 10, 2, 98),
          y: clamp(Math.round((initY + dyPct) * 10) / 10, 2, 98),
        });
      } else if (dragMode === "resize-br") {
        updateIndicator({
          width: clamp(Math.round((initW + dxPct * 2) * 10) / 10, 4, 60),
          height: clamp(Math.round((initH + dyPct * 2) * 10) / 10, 10, 90),
        });
      } else if (dragMode === "resize-tl") {
        updateIndicator({
          width: clamp(Math.round((initW - dxPct * 2) * 10) / 10, 4, 60),
          height: clamp(Math.round((initH - dyPct * 2) * 10) / 10, 10, 90),
        });
      } else if (dragMode === "resize-tr") {
        updateIndicator({
          width: clamp(Math.round((initW + dxPct * 2) * 10) / 10, 4, 60),
          height: clamp(Math.round((initH - dyPct * 2) * 10) / 10, 10, 90),
        });
      } else if (dragMode === "resize-bl") {
        updateIndicator({
          width: clamp(Math.round((initW - dxPct * 2) * 10) / 10, 4, 60),
          height: clamp(Math.round((initH + dyPct * 2) * 10) / 10, 10, 90),
        });
      } else if (dragMode === "rotate") {
        const centerPxX = rect.left + (initX / 100) * rect.width;
        const centerPxY = rect.top + (initY / 100) * rect.height;
        const currentAngle = Math.atan2(e.clientY - centerPxY, e.clientX - centerPxX) * (180 / Math.PI);
        const newRot = Math.round(currentAngle + 90);
        updateIndicator({ rotation: newRot });
      }
    };

    const handlePointerUp = () => {
      setDragMode(null);
      dragStartRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragMode, containerRef, updateIndicator]);

  // Motion fill percentage (0 to 100)
  const motionPct = clamp(currentPos, 0, 100);

  return (
    <div
      className="absolute pointer-events-auto"
      style={{
        left: `${indicator.x}%`,
        top: `${indicator.y}%`,
        width: `${indicator.width}%`,
        height: `${indicator.height}%`,
        transform: `translate(-50%, -50%) rotate(${indicator.rotation}deg)`,
        transformOrigin: "center center",
      }}
      onClick={(e) => {
        e.stopPropagation();
        updateIndicator({ selected: !indicator.selected });
      }}
    >
      {/* High-contrast container outline */}
      <div
        className={cn(
          "relative h-full w-full rounded-md transition-shadow cursor-grab active:cursor-grabbing select-none overflow-hidden",
          indicator.contrastOutline
            ? "border-2 border-white shadow-[0_0_0_1.5px_#000,0_4px_16px_rgba(0,0,0,0.85)] bg-black/60 backdrop-blur-xs"
            : "border border-border/80 bg-surface/75 shadow-md backdrop-blur-xs",
          indicator.selected && "ring-2 ring-sky-400/90 ring-offset-2 ring-offset-black/70",
        )}
        onPointerDown={(e) => handlePointerDown("move", e)}
      >
        {/* Dynamic motion fill bar reflecting actual live position */}
        <div className="absolute inset-0 flex flex-col justify-end p-0.5 pointer-events-none">
          <div
            className="w-full rounded-sm transition-[height] duration-75 ease-out"
            style={{
              height: `${motionPct}%`,
              background:
                "linear-gradient(180deg, #38bdf8 0%, #0284c7 70%, color-mix(in oklab, #0284c7 60%, black) 100%)",
              boxShadow: "0 0 10px rgba(56, 189, 248, 0.6)",
            }}
          />
        </div>

        {/* Center stroke guideline */}
        <div className="absolute inset-y-1 left-1/2 -translate-x-1/2 w-px border-l border-dashed border-white/30 pointer-events-none" />

        {/* Numeric position readout badge */}
        <div className="absolute bottom-1 inset-x-0 flex items-center justify-center pointer-events-none">
          <span className="font-mono text-[9px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {Math.round(motionPct)}%
          </span>
        </div>
      </div>

      {/* Resize & Rotation Controls (shown when selected) */}
      {indicator.selected && (
        <>
          {/* Rotation Handle on extended stem */}
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto">
            <div
              className="size-5 rounded-full bg-sky-500 text-white flex items-center justify-center cursor-grab shadow-lg hover:scale-110 active:scale-95 transition-transform"
              onPointerDown={(e) => handlePointerDown("rotate", e)}
              title="Rotate indicator"
            >
              <RotateCw className="size-3" />
            </div>
            <div className="w-0.5 h-2 bg-sky-400" />
          </div>

          {/* 4 Corner Resize Handles */}
          <div
            className="absolute -top-1.5 -left-1.5 size-3 rounded-full bg-white border-2 border-sky-500 cursor-nwse-resize shadow-md"
            onPointerDown={(e) => handlePointerDown("resize-tl", e)}
          />
          <div
            className="absolute -top-1.5 -right-1.5 size-3 rounded-full bg-white border-2 border-sky-500 cursor-nesw-resize shadow-md"
            onPointerDown={(e) => handlePointerDown("resize-tr", e)}
          />
          <div
            className="absolute -bottom-1.5 -left-1.5 size-3 rounded-full bg-white border-2 border-sky-500 cursor-nesw-resize shadow-md"
            onPointerDown={(e) => handlePointerDown("resize-bl", e)}
          />
          <div
            className="absolute -bottom-1.5 -right-1.5 size-3 rounded-full bg-white border-2 border-sky-500 cursor-nwse-resize shadow-md"
            onPointerDown={(e) => handlePointerDown("resize-br", e)}
          />

          {/* Quick HUD Toolbar below indicator */}
          <div
            className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded border border-border/90 bg-black/85 px-1.5 py-0.5 shadow-xl backdrop-blur-md whitespace-nowrap z-40 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {primaryPointA.set && primaryPointB.set && (
              <button
                type="button"
                onClick={snapIndicatorToPoints}
                className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-sky-300 hover:text-white transition-colors"
                title="Align position, span, and rotation to Primary A & B points"
              >
                <Magnet className="size-2.5" />
                <span>Snap to A–B</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => updateIndicator({ contrastOutline: !indicator.contrastOutline })}
              className="px-1 py-0.5 text-[10px] text-muted hover:text-white transition-colors"
              title="Toggle contrast outline"
            >
              {indicator.contrastOutline ? "Contrast On" : "Contrast Off"}
            </button>

            <button
              type="button"
              onClick={() => updateIndicator({ selected: false })}
              className="px-1 py-0.5 text-[10px] text-muted hover:text-white transition-colors"
            >
              Done
            </button>
          </div>
        </>
      )}
    </div>
  );
}
