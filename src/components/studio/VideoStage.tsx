import React, { useEffect, useRef, useState, type RefObject } from "react";
import { Film, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/lib/cadence/store";
import { cn } from "@/lib/utils";
import { ReferenceOverlay } from "./ReferenceOverlay";
import { PrimaryTrackingOverlay } from "./PrimaryTrackingOverlay";
import { InteractiveIndicatorOverlay } from "./InteractiveIndicatorOverlay";
import { RecoveryModal } from "./RecoveryModal";
import { ViewerZoomControls } from "./ViewerZoomControls";

type VideoStageProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
};

export function VideoStage({ videoRef }: VideoStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const videoUrl = useStudio((s) => s.videoUrl);
  const playing = useStudio((s) => s.playing);
  const playheadMs = useStudio((s) => s.playheadMs);
  const durationMs = useStudio((s) => s.meta.durationMs);
  const sourceKind = useStudio((s) => s.meta.sourceKind);
  const sourceName = useStudio((s) => s.meta.sourceName);
  const setPlayhead = useStudio((s) => s.setPlayhead);
  const resetDemo = useStudio((s) => s.resetDemo);
  const currentTrackingFrame = useStudio((s) => s.currentTrackingFrame);

  const viewerTransform = useStudio((s) => s.viewerTransform);
  const setViewerPan = useStudio((s) => s.setViewerPan);

  const [isPanMode, setIsPanMode] = useState(false);
  const [isDraggingPan, setIsDraggingPan] = useState(false);
  const lastMousePos = useRef<{ x: number; y: number } | null>(null);

  // Sync video play/pause and time with studio state
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    if (playing && video.paused) {
      void video.play().catch(() => {});
    } else if (!playing && !video.paused) {
      video.pause();
    }
  }, [playing, videoUrl, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    const targetTimeSec = playheadMs / 1000;
    if (Math.abs(video.currentTime - targetTimeSec) > 0.08) {
      video.currentTime = targetTimeSec;
    }
  }, [playheadMs, videoUrl, videoRef]);

  // Demo visualizer rendering when sourceKind is "demo"
  useEffect(() => {
    if (sourceKind !== "demo" && videoUrl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Dark sleek stage backdrop
    const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, Math.max(w, h));
    bgGrad.addColorStop(0, "#18181b");
    bgGrad.addColorStop(1, "#09090b");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = 0; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Kinematic light sculpture visualization synced to playhead
    const tSec = playheadMs / 1000;
    const cycle = Math.sin(tSec * 2.8) * 0.5 + 0.5;
    const beamY = h * (0.2 + cycle * 0.6);
    const beamX = w * 0.5 + Math.sin(tSec * 0.7) * 20;

    // Glowing core
    const glowGrad = ctx.createRadialGradient(beamX, beamY, 5, beamX, beamY, 120);
    glowGrad.addColorStop(0, "rgba(56, 189, 248, 0.85)");
    glowGrad.addColorStop(0.3, "rgba(14, 165, 233, 0.35)");
    glowGrad.addColorStop(1, "rgba(14, 165, 233, 0)");
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(beamX, beamY, 120, 0, Math.PI * 2);
    ctx.fill();

    // Core node
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(beamX, beamY, 8, 0, Math.PI * 2);
    ctx.fill();

    // Oscillating motion trail
    ctx.beginPath();
    ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
    ctx.lineWidth = 3;
    for (let i = 0; i <= 30; i++) {
      const pastT = tSec - (i * 0.03);
      const pastCycle = Math.sin(pastT * 2.8) * 0.5 + 0.5;
      const py = h * (0.2 + pastCycle * 0.6);
      const px = w * 0.5 + Math.sin(pastT * 0.7) * 20;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }, [playheadMs, sourceKind, videoUrl]);

  // Pan interaction handling
  const handlePointerDown = (e: React.PointerEvent) => {
    if (isPanMode || e.button === 1 || viewerTransform.zoom > 1) {
      if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest(".pointer-events-auto")) {
        return;
      }
      setIsDraggingPan(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingPan || !lastMousePos.current) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    setViewerPan(viewerTransform.panX + dx, viewerTransform.panY + dy);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDraggingPan) {
      setIsDraggingPan(false);
      lastMousePos.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const currentPos = currentTrackingFrame?.active ? 50 : 50;

  const hasMedia = Boolean(videoUrl) || sourceKind === "demo" || sourceName !== "";

  return (
    <div
      ref={containerRef}
      className={cn(
        "area-video relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-bg select-none",
        isPanMode && "cursor-grab active:cursor-grabbing",
        viewerTransform.zoom > 1 && !isPanMode && "cursor-default",
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Zoom / Pan Container */}
      <div
        className="relative flex items-center justify-center transition-transform duration-75 ease-out"
        style={{
          transform: `translate3d(${viewerTransform.panX}px, ${viewerTransform.panY}px, 0) scale(${viewerTransform.zoom})`,
          transformOrigin: "center center",
          width: "100%",
          height: "100%",
        }}
      >
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            playsInline
            muted
            className="max-h-full max-w-full rounded-sm object-contain shadow-2xl"
            onTimeUpdate={(e) => {
              const currentMs = Math.round(e.currentTarget.currentTime * 1000);
              if (Math.abs(currentMs - playheadMs) > 120) {
                setPlayhead(currentMs);
              }
            }}
          />
        ) : sourceKind === "demo" ? (
          <div className="relative flex h-full max-h-[85vh] w-full max-w-5xl items-center justify-center p-4">
            <canvas
              ref={canvasRef}
              width={854}
              height={480}
              className="aspect-video w-full rounded-md border border-border/60 bg-black/90 object-contain shadow-2xl"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl border border-border/80 bg-surface text-muted">
              <Film className="size-8" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-fg">No Video Loaded</h2>
              <p className="mt-1 text-xs text-muted">
                Drag and drop a video file, or explore the built-in tracking demo sandbox.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" variant="outline" onClick={resetDemo} className="gap-2">
                <Sparkles className="size-3.5 text-accent" />
                Launch Demo Sandbox
              </Button>
            </div>
          </div>
        )}

        {/* Phase 2: Six-Point Calibration Overlay */}
        <ReferenceOverlay />

        {/* Phase 3: Primary Dual-Centroid Tracking Overlay */}
        <PrimaryTrackingOverlay />

        {/* Phase 3: Interactive Bounding Indicator Overlay */}
        <InteractiveIndicatorOverlay containerRef={containerRef} currentPos={currentPos} />
      </div>

      {/* Recovery Modal Dialog */}
      <RecoveryModal />

      {/* Viewer Zoom & Pan Controls */}
      <ViewerZoomControls
        isPanMode={isPanMode}
        onTogglePanMode={() => setIsPanMode(!isPanMode)}
      />
    </div>
  );
}

export function Dropveil({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-bg/85 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-accent bg-surface/95 p-8 text-center shadow-2xl">
        <div className="flex size-14 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <Upload className="size-7" />
        </div>
        <div>
          <h3 className="font-display text-base font-semibold text-fg">Drop Video or Funscript</h3>
          <p className="mt-1 text-xs text-muted">Supports MP4, WebM, MOV, and .funscript JSON files</p>
        </div>
      </div>
    </div>
  );
}
