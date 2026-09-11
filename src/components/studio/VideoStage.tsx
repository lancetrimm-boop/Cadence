import { useEffect, type RefObject } from "react";
import { Check, CornerDownRight, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { demoPoseAt } from "@/lib/cadence/demo";
import { interpolatePos } from "@/lib/cadence/funscript";
import { formatTimecode } from "@/lib/cadence/format";
import { useStudio, useCalibrationVector } from "@/lib/cadence/store";
import { cn } from "@/lib/utils";
import { ReferenceOverlay } from "./ReferenceOverlay";
import { PrimaryTrackingOverlay } from "./PrimaryTrackingOverlay";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
};

export function VideoStage({ videoRef }: Props) {
  const playheadMs = useStudio((s) => s.playheadMs);
  const videoUrl = useStudio((s) => s.videoUrl);
  const sourceKind = useStudio((s) => s.meta.sourceKind);
  const durationMs = useStudio((s) => s.meta.durationMs);
  const actions = useStudio((s) => s.actions);
  const analysis = useStudio((s) => s.analysis);
  const abRegion = useStudio((s) => s.abRegion);
  const setRegionPoint = useStudio((s) => s.setRegionPoint);
  const confirmAbRegion = useStudio((s) => s.confirmAbRegion);
  const resetAbRegion = useStudio((s) => s.resetAbRegion);
  const setPlayhead = useStudio((s) => s.setPlayhead);
  const updateVideoDuration = useStudio((s) => s.updateVideoDuration);
  const isTrackingActive = useStudio((s) => s.isTrackingActive);
  const updateTrackingForPlayhead = useStudio((s) => s.updateTrackingForPlayhead);
  const currentTrackingFrame = useStudio((s) => s.currentTrackingFrame);
  const vector = useCalibrationVector();

  // Keep duration synchronized with video element without running unsolicited fake analysis
  useEffect(() => {
    if (!videoUrl) return;
    const video = videoRef.current;
    if (!video) return;

    const onMeta = () => {
      const dur = Math.round((video.duration || 0) * 1000);
      if (dur > 0) updateVideoDuration(dur);
    };

    if (video.readyState >= 1 && video.duration) {
      onMeta();
    } else {
      video.addEventListener("loadedmetadata", onMeta, { once: true });
      return () => video.removeEventListener("loadedmetadata", onMeta);
    }
  }, [videoUrl, videoRef, updateVideoDuration]);

  // Update Phase 3 optical tracking whenever playhead moves and tracking is active
  useEffect(() => {
    if (isTrackingActive) {
      updateTrackingForPlayhead(videoRef.current);
    }
  }, [playheadMs, isTrackingActive, updateTrackingForPlayhead, videoRef]);

  // Position: either live funscript action interpolation, or resting baseline when actions empty
  const hasRealActions = actions.length > 0;
  const pos = hasRealActions ? interpolatePos(actions, playheadMs) : 0;

  return (
    <section className="area-video relative min-h-0 bg-bg">
      <div className="relative h-full min-h-40 overflow-hidden bg-elevated">
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            className="h-full w-full bg-bg object-contain"
            playsInline
            preload="auto"
          />
        ) : (
          <DemoStage tMs={playheadMs} />
        )}

        {/* Phase 2: A–B Region Setup Bar (Active before confirmation) */}
        {!abRegion.confirmed && (
          <div className="absolute inset-x-0 top-3 z-30 mx-auto max-w-xl px-3 pointer-events-auto">
            <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-border/80 bg-surface/92 p-2.5 shadow-xl backdrop-blur-md">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
                  <Flag className="size-3" />
                  <span>Phase 2: Step 1 · Define A–B Region</span>
                </div>
                <div className="truncate text-xs text-muted">
                  {abRegion.startMs === null && abRegion.endMs === null
                    ? "Navigate video and set Point A (crest) and Point B (trough)"
                    : abRegion.startMs !== null && abRegion.endMs === null
                      ? `Point A set (${formatTimecode(abRegion.startMs)}) · Now navigate to trough & set Point B`
                      : abRegion.startMs === null && abRegion.endMs !== null
                        ? `Point B set (${formatTimecode(abRegion.endMs)}) · Now navigate to crest & set Point A`
                        : `Span: ${formatTimecode(Math.min(abRegion.startMs!, abRegion.endMs!))} – ${formatTimecode(Math.max(abRegion.startMs!, abRegion.endMs!))} · Ready to confirm`}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant={abRegion.startMs !== null ? "secondary" : "outline"}
                  onClick={() => setRegionPoint("A")}
                  className={cn(
                    "h-7 px-2.5 text-xs font-medium gap-1",
                    abRegion.startMs !== null && "border-sky-500/50 text-sky-400",
                  )}
                  title="Set Point A at current playhead"
                >
                  <span className="font-bold text-sky-400">A:</span>
                  <span>{abRegion.startMs !== null ? formatTimecode(abRegion.startMs) : "Set A"}</span>
                </Button>

                <Button
                  size="sm"
                  variant={abRegion.endMs !== null ? "secondary" : "outline"}
                  onClick={() => setRegionPoint("B")}
                  className={cn(
                    "h-7 px-2.5 text-xs font-medium gap-1",
                    abRegion.endMs !== null && "border-amber-500/50 text-amber-400",
                  )}
                  title="Set Point B at current playhead"
                >
                  <span className="font-bold text-amber-400">B:</span>
                  <span>{abRegion.endMs !== null ? formatTimecode(abRegion.endMs) : "Set B"}</span>
                </Button>

                {abRegion.startMs !== null && abRegion.endMs !== null && (
                  <Button
                    size="sm"
                    onClick={confirmAbRegion}
                    className="h-7 px-3 bg-accent text-accent-fg text-xs font-medium shadow-sm hover:opacity-90 transition-opacity gap-1"
                  >
                    <Check className="size-3" />
                    Confirm A–B Region
                  </Button>
                )}

                {(abRegion.startMs !== null || abRegion.endMs !== null) && (
                  <button
                    type="button"
                    onClick={resetAbRegion}
                    className="text-[11px] text-subtle hover:text-fg px-1.5 py-1"
                    title="Clear region points"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Phase 2: A–B Reference Points Overlay (Only shown once A–B region is confirmed) */}
        {abRegion.confirmed && <ReferenceOverlay />}

        {/* Phase 3: Primary Points A & B Optical Tracking Overlay */}
        {abRegion.confirmed && <PrimaryTrackingOverlay />}

        {analysis?.running ? (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-bg/70 px-6">
            <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-elevated hairline">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-[var(--motion-fast)] ease-[var(--ease-out)]"
                style={{ width: `${Math.round(analysis.progress * 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted tabular">{analysis.label}</p>
          </div>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-3">
          <div className="rounded-sm bg-bg/70 px-2 py-1 text-xs uppercase tracking-[0.14em] text-muted">
            {sourceKind === "demo" ? "Demo sandbox" : sourceKind === "video" ? "Video source" : "Script only"}
          </div>
          <div className="rounded-sm bg-bg/70 px-2 py-1 text-xs tabular text-fg">
            {formatTimecode(playheadMs, false)}
            <span className="text-subtle"> / {formatTimecode(durationMs, false)}</span>
          </div>
        </div>

        {/* Vertical Motion Indicator (Working, inactive when no funscript actions exist) */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-end justify-between p-3">
          <Meter value={pos} travelSpan={vector.travelSpanY} active={hasRealActions} />
        </div>
      </div>
    </section>
  );
}

function DemoStage({ tMs }: { tMs: number }) {
  const pose = demoPoseAt(tMs);
  const bottom = 10 + pose.pos * 56;
  const handBottom = 10 + pose.hand * 56;
  const glow = 0.22 + pose.energy * 0.38;

  return (
    <div className="relative h-full w-full overflow-hidden bg-bg">
      <div
        className="absolute inset-0"
        style={{ transform: `translateX(${-pose.cameraX * 22}%)` }}
      >
        <div
          className="absolute inset-x-0 bottom-0 top-[58%] opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle, color-mix(in oklab, var(--color-fg) 55%, transparent) 1.1px, transparent 1.2px)",
            backgroundSize: "28px 22px",
            backgroundPosition: "center top",
          }}
        />
        <div className="absolute inset-x-0 top-[58%] h-px bg-fg/15" />

        <div
          className="absolute left-1/2 w-10 rounded-full"
          style={{
            height: "18%",
            bottom: `${bottom}%`,
            transform: "translateX(-50%)",
            background:
              "linear-gradient(180deg, var(--color-fg) 0%, var(--color-signal) 70%, color-mix(in oklab, var(--color-signal) 55%, black) 100%)",
            boxShadow: `0 0 32px 10px color-mix(in oklab, var(--color-signal) ${Math.round(glow * 70)}%, transparent)`,
          }}
        />
        <div
          className="absolute left-1/2 size-2.5 rounded-full bg-signal"
          style={{
            bottom: `${handBottom + 4}%`,
            transform: "translateX(160%)",
            opacity: 0.5 + pose.energy * 0.4,
          }}
        />
        <div
          className="absolute left-1/2 w-8 rounded-full bg-fg/20"
          style={{
            height: "7%",
            bottom: "7%",
            transform: "translateX(-50%)",
            filter: "blur(8px)",
            opacity: 0.35 + pose.pos * 0.25,
          }}
        />
      </div>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 35%, color-mix(in oklab, var(--color-bg) 70%, transparent) 100%)",
        }}
      />
      {pose.cut > 0.18 ? (
        <div className="absolute inset-0 bg-fg" style={{ opacity: pose.cut * 0.32 }} />
      ) : null}
    </div>
  );
}

function Meter({ value, travelSpan, active = true }: { value: number; travelSpan?: number; active?: boolean }) {
  return (
    <div className="flex items-end gap-2 select-none">
      <div className="relative flex h-16 w-3.5 flex-col justify-end overflow-hidden rounded-xs bg-bg/85 backdrop-blur-xs hairline">
        <div
          className={cn(
            "w-full transition-[height] duration-75 ease-out",
            active ? "bg-accent" : "bg-subtle/30",
          )}
          style={{ height: `${active ? Math.max(0, Math.min(100, value)) : 0}%` }}
        />
      </div>
      <div className="rounded-sm bg-bg/85 px-2 py-1 backdrop-blur-xs hairline">
        <div className="text-[10px] uppercase tracking-[0.14em] text-subtle">
          {active ? "Pos" : "Pos (Idle)"}
        </div>
        <div className="text-sm font-medium tabular text-fg">
          {active ? Math.round(value) : "—"}
        </div>
      </div>
      {travelSpan !== undefined && travelSpan > 0 && (
        <div className="hidden sm:block rounded-sm bg-bg/85 px-2 py-1 backdrop-blur-xs hairline">
          <div className="text-[10px] uppercase tracking-[0.14em] text-subtle">Ref Span</div>
          <div className="text-sm font-medium tabular text-fg">{travelSpan}%</div>
        </div>
      )}
    </div>
  );
}

export function Dropveil({ active }: { active: boolean }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-bg/80 transition-opacity duration-[var(--motion-fast)] ease-[var(--ease-out)]",
        active ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="rounded-lg border border-dashed border-accent/40 px-8 py-6 text-center">
        <p className="font-display text-2xl text-fg">Drop a video</p>
        <p className="mt-1 text-sm text-muted">Or a .funscript to overlay</p>
      </div>
    </div>
  );
}
