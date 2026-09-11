import { useEffect, useRef, type RefObject } from "react";
import { demoPoseAt } from "@/lib/cadence/demo";
import { interpolatePos } from "@/lib/cadence/funscript";
import { formatTimecode } from "@/lib/cadence/format";
import { useStudio } from "@/lib/cadence/store";
import { cn } from "@/lib/utils";

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
  const analyzeCurrentVideo = useStudio((s) => s.analyzeCurrentVideo);
  const setToast = useStudio((s) => s.setToast);
  const analyzedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!videoUrl) {
      analyzedFor.current = null;
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    if (analyzedFor.current === videoUrl) return;
    const run = async () => {
      analyzedFor.current = videoUrl;
      try {
        await analyzeCurrentVideo(video);
      } catch (err) {
        analyzedFor.current = null;
        setToast(err instanceof Error ? err.message : "Analysis failed.");
      }
    };
    if (video.readyState >= 1) void run();
    else {
      const onMeta = () => void run();
      video.addEventListener("loadedmetadata", onMeta, { once: true });
      return () => video.removeEventListener("loadedmetadata", onMeta);
    }
  }, [videoUrl, videoRef, analyzeCurrentVideo, setToast]);

  const pos = interpolatePos(actions, playheadMs);

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

        {analysis?.running ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg/70 px-6">
            <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-elevated hairline">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-[var(--motion-fast)] ease-[var(--ease-out)]"
                style={{ width: `${Math.round(analysis.progress * 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted tabular">{analysis.label}</p>
          </div>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <div className="rounded-sm bg-bg/70 px-2 py-1 text-xs uppercase tracking-[0.14em] text-muted">
            {sourceKind === "demo" ? "Demo source" : sourceKind === "video" ? "Video" : "Script only"}
          </div>
          <div className="rounded-sm bg-bg/70 px-2 py-1 text-xs tabular text-fg">
            {formatTimecode(playheadMs, false)}
            <span className="text-subtle"> / {formatTimecode(durationMs, false)}</span>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-3">
          <Meter value={pos} />
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

function Meter({ value }: { value: number }) {
  return (
    <div className="flex items-end gap-2">
      <div className="flex h-16 w-3 flex-col justify-end overflow-hidden rounded-xs bg-bg/70 hairline">
        <div className="w-full bg-accent" style={{ height: `${value}%` }} />
      </div>
      <div className="rounded-sm bg-bg/70 px-2 py-1">
        <div className="text-xs uppercase tracking-[0.14em] text-subtle">Pos</div>
        <div className="text-sm tabular text-fg">{Math.round(value)}</div>
      </div>
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
