import { useEffect, useRef, useState, type RefObject } from "react";
import { Header } from "./Header";
import { Inspector } from "./Inspector";
import { Timeline } from "./Timeline";
import { Transport } from "./Transport";
import { Dropveil, VideoStage } from "./VideoStage";
import { downloadText, serializeFunscript, slugify } from "@/lib/cadence/funscript";
import { resample } from "@/lib/cadence/signal";
import { useStudio } from "@/lib/cadence/store";

export function Studio() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [help, setHelp] = useState(false);
  const [dragging, setDragging] = useState(false);
  const playing = useStudio((s) => s.playing);
  const toast = useStudio((s) => s.toast);
  const setToast = useStudio((s) => s.setToast);

  usePlayback(videoRef);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const s = useStudio.getState();
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        s.togglePlay();
      } else if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        setHelp((v) => !v);
      } else if (e.key === "Escape") {
        setHelp(false);
        s.select(null);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const step = e.shiftKey ? 1000 : e.altKey ? 40 : 200;
        s.setPlayhead(s.playheadMs - step, true);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const step = e.shiftKey ? 1000 : e.altKey ? 40 : 200;
        s.setPlayhead(s.playheadMs + step, true);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        s.nudge(0, e.shiftKey ? 5 : 1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        s.nudge(0, e.shiftKey ? -5 : -1);
      } else if (e.key === "Home") {
        s.setPlayhead(0, true);
      } else if (e.key === "End") {
        s.setPlayhead(s.meta.durationMs, true);
      } else if (e.key === "Backspace" || e.key === "Delete") {
        s.removeSelected();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        s.redo();
      } else if (e.key === "n" || e.key === "N") {
        const sample = resample(
          s.samples.map((m) => ({ t: m.t, v: m.pos })),
          s.playheadMs,
        );
        s.addAction(s.playheadMs, Math.round(sample * 100));
      } else if (e.key === "[") {
        s.setZoom(s.zoom / 1.25);
      } else if (e.key === "]") {
        s.setZoom(s.zoom * 1.25);
      } else if (e.key === "1") s.setStyle("signature");
      else if (e.key === "2") s.setStyle("mechanical");
      else if (e.key === "3") s.setStyle("soft");
      else if (e.key === "4") s.setStyle("dense");
      else if (e.key.toLowerCase() === "e" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        exportCurrent();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(id);
  }, [toast, setToast]);

  const onExport = () => exportCurrent();

  return (
    <main
      className="studio-grid relative bg-bg text-fg"
      onDragEnter={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void handleDrop(e.dataTransfer.files);
      }}
    >
      <Header onExport={onExport} onHelp={() => setHelp(true)} />

      <div className="workspace min-h-0">
        <VideoStage videoRef={videoRef} />
        <Inspector />
        <div className="area-dock">
          <Timeline />
          <Transport onExport={onExport} />
        </div>
      </div>

      <Dropveil active={dragging} />
      {help ? <Shortcuts onClose={() => setHelp(false)} /> : null}

      {toast ? (
        <div className="pointer-events-none absolute bottom-20 left-1/2 z-20 -translate-x-1/2 rounded-md bg-elevated px-3 py-2 text-sm text-fg hairline">
          {toast}
        </div>
      ) : null}

      <span className="sr-only">{playing ? "Playing" : "Paused"}</span>
    </main>
  );
}

function exportCurrent() {
  const { actions, meta } = useStudio.getState();
  const text = serializeFunscript({
    actions,
    title: meta.title,
    durationMs: meta.durationMs,
  });
  downloadText(`${slugify(meta.title)}.funscript`, text);
  useStudio.getState().setToast("Exported .funscript");
}

async function handleDrop(files: FileList | null) {
  if (!files || files.length === 0) return;
  const file = files[0]!;
  const name = file.name.toLowerCase();
  const s = useStudio.getState();
  if (name.endsWith(".funscript") || name.endsWith(".json") || file.type.includes("json")) {
    try {
      s.importScript(await file.text(), file.name);
    } catch (err) {
      s.setToast(err instanceof Error ? err.message : "Could not read script.");
    }
    return;
  }
  if (file.type.startsWith("video/") || /\.(mp4|webm|mov|mkv|m4v)$/i.test(name)) {
    await s.loadVideoFile(file);
    return;
  }
  s.setToast("Drop a video or a .funscript file.");
}

function usePlayback(videoRef: RefObject<HTMLVideoElement | null>) {
  const playing = useStudio((s) => s.playing);
  const playheadMs = useStudio((s) => s.playheadMs);
  const videoUrl = useStudio((s) => s.videoUrl);
  const setPlayhead = useStudio((s) => s.setPlayhead);
  const setPlaying = useStudio((s) => s.setPlaying);
  const durationMs = useStudio((s) => s.meta.durationMs);
  const seekGen = useRef(0);

  useEffect(() => {
    const video = videoRef.current;
    if (videoUrl && video) {
      const target = playheadMs / 1000;
      if (Math.abs(video.currentTime - target) > 0.08 && !playing) {
        video.currentTime = target;
      }
    }
  }, [playheadMs, playing, videoUrl, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (videoUrl && video) {
      if (playing) {
        if (Math.abs(video.currentTime - playheadMs / 1000) > 0.12) {
          video.currentTime = playheadMs / 1000;
        }
        void video.play().catch(() => setPlaying(false));
      } else {
        video.pause();
      }
    }
    // playheadMs is read once when play starts, not a loop dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, videoUrl, videoRef, setPlaying]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const gen = ++seekGen.current;
    let last = performance.now();
    const loop = (now: number) => {
      if (seekGen.current !== gen) return;
      const video = videoRef.current;
      if (videoUrl && video && !video.paused) {
        const t = video.currentTime * 1000;
        if (t >= durationMs - 20) {
          setPlayhead(durationMs, true);
          video.pause();
          return;
        }
        setPlayhead(t);
      } else {
        const dt = now - last;
        last = now;
        const next = useStudio.getState().playheadMs + dt;
        if (next >= durationMs) {
          setPlayhead(durationMs, true);
          return;
        }
        setPlayhead(next);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, videoUrl, durationMs, setPlayhead, videoRef]);
}

function Shortcuts({ onClose }: { onClose: () => void }) {
  const rows: Array<[string, string]> = [
    ["Space", "Play / pause"],
    ["← →", "Seek 200 ms (Shift 1 s)"],
    ["↑ ↓", "Nudge position"],
    ["N", "Add point at playhead"],
    ["Delete", "Remove selected"],
    ["[ ]", "Zoom"],
    ["⌘Z / ⌘Y", "Undo / redo"],
    ["1–4", "Style presets"],
    ["Click script lane", "Add a point"],
    ["Drag point", "Edit time and position"],
  ];
  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-bg/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-surface p-5 hairline"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl">Keys</h2>
          <button type="button" className="text-sm text-muted" onClick={onClose}>
            Close
          </button>
        </div>
        <ul className="mt-4 space-y-2">
          {rows.map(([k, v]) => (
            <li key={k} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted">{v}</span>
              <kbd className="rounded-xs bg-elevated px-1.5 py-0.5 text-xs text-fg">{k}</kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
