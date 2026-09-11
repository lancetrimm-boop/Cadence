import { useRef, useState } from "react";
import {
  Film,
  FileCode2,
  PlayCircle,
  Clock,
  ArrowRight,
  Upload,
  Sparkles,
  Layers,
  FolderOpen,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/lib/cadence/store";
import { formatTimecode } from "@/lib/cadence/format";

export function HomeScreen() {
  const videoInputRef = useRef<HTMLInputElement>(null);
  const scriptInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const loadVideoFile = useStudio((s) => s.loadVideoFile);
  const importScript = useStudio((s) => s.importScript);
  const resetDemo = useStudio((s) => s.resetDemo);
  const setActiveView = useStudio((s) => s.setActiveView);
  const setToast = useStudio((s) => s.setToast);

  // Current session in memory (if any)
  const meta = useStudio((s) => s.meta);
  const actionsCount = useStudio((s) => s.actions.length);
  const videoUrl = useStudio((s) => s.videoUrl);
  const hasActiveSession = actionsCount > 0 || !!videoUrl;

  const handleVideoSelect = (file: File) => {
    void loadVideoFile(file);
  };

  const handleScriptSelect = async (file: File) => {
    try {
      const text = await file.text();
      importScript(text, file.name);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Could not parse funscript file.");
    }
  };

  const handleFileDrop = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0]!;
    const name = file.name.toLowerCase();

    if (name.endsWith(".funscript") || name.endsWith(".json") || file.type.includes("json")) {
      void handleScriptSelect(file);
      return;
    }

    if (file.type.startsWith("video/") || /\.(mp4|webm|mov|mkv|m4v)$/i.test(name)) {
      handleVideoSelect(file);
      return;
    }

    setToast("Please drop a valid video or .funscript file.");
  };

  return (
    <div
      className="relative flex min-h-screen flex-col bg-bg text-fg overflow-y-auto"
      onDragEnter={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFileDrop(e.dataTransfer.files);
      }}
    >
      {/* Hidden native file inputs */}
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*,.mp4,.webm,.mov,.mkv,.m4v"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handleVideoSelect(file);
        }}
      />
      <input
        ref={scriptInputRef}
        type="file"
        accept=".funscript,application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleScriptSelect(file);
        }}
      />

      {/* Subtle Drag & Drop Overlay */}
      {isDragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-bg/85 backdrop-blur-xs">
          <div className="flex flex-col items-center gap-3 rounded-xl border border-accent/40 bg-surface px-8 py-10 shadow-2xl">
            <Upload className="size-10 text-accent animate-pulse" />
            <p className="font-display text-xl text-fg">Drop media to begin</p>
            <p className="text-sm text-muted">Supports MP4, WebM, MOV, and .funscript files</p>
          </div>
        </div>
      )}

      {/* Top Bar / Brand Header */}
      <header className="border-b border-border bg-surface/80 px-6 py-4 backdrop-blur-xs">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-elevated hairline">
              <span className="font-display text-lg font-bold text-accent">C</span>
            </div>
            <div>
              <span className="font-display text-lg tracking-tight text-fg">Cadence</span>
              <span className="ml-2.5 rounded-sm bg-elevated px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-subtle hairline">
                Production Workstation
              </span>
            </div>
          </div>
          {hasActiveSession && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveView("studio")}
              className="gap-2 text-xs"
            >
              Resume Active Project
              <ArrowRight className="size-3.5" />
            </Button>
          )}
        </div>
      </header>

      {/* Main Start Screen Content */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        {/* Hero Section */}
        <section className="mb-10 text-left">
          <h1 className="font-display text-3xl font-medium tracking-tight text-fg sm:text-4xl">
            Cadence
          </h1>
          <p className="mt-2 max-w-2xl text-base text-muted sm:text-lg">
            AI-assisted video-to-funscript production
          </p>
          <p className="mt-1 text-xs text-subtle">
            Extract motion vectors, detect scene cuts and camera sway, and synthesize synchronized
            tactile scripts with human-in-the-loop review.
          </p>
        </section>

        {/* Primary Action Grid */}
        <section className="grid gap-4 md:grid-cols-3">
          {/* Action 1: New Project / Open Video */}
          <div
            onClick={() => videoInputRef.current?.click()}
            className="group relative flex cursor-pointer flex-col justify-between rounded-xl border border-border bg-surface p-6 transition-all duration-150 hover:border-accent/40 hover:bg-elevated hover:shadow-lg"
          >
            <div>
              <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-elevated text-accent transition-colors group-hover:bg-accent group-hover:text-accent-fg hairline">
                <Film className="size-6" />
              </div>
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-medium text-fg">
                  New Project / Open Video
                </h2>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Load a local video to calibrate reference points A1–A3 & B1–B3, establish stroke
                travel bounds, and prepare the tracking foundation.
              </p>
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4">
              <span className="text-xs text-subtle">MP4, WebM, MOV</span>
              <span className="flex items-center gap-1 text-xs font-medium text-accent group-hover:underline">
                Select file <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </div>

          {/* Action 2: Open Funscript */}
          <div
            onClick={() => scriptInputRef.current?.click()}
            className="group relative flex cursor-pointer flex-col justify-between rounded-xl border border-border bg-surface p-6 transition-all duration-150 hover:border-accent/40 hover:bg-elevated hover:shadow-lg"
          >
            <div>
              <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-elevated text-accent transition-colors group-hover:bg-accent group-hover:text-accent-fg hairline">
                <FileCode2 className="size-6" />
              </div>
              <h2 className="font-display text-lg font-medium text-fg">
                Open Funscript
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Import an existing .funscript file to inspect its timeline curves, fine-tune action
                nodes, and review statistics.
              </p>
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4">
              <span className="text-xs text-subtle">.funscript, JSON</span>
              <span className="flex items-center gap-1 text-xs font-medium text-accent group-hover:underline">
                Import script <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </div>

          {/* Action 3: Explore Demo Project */}
          <div
            onClick={() => {
              resetDemo();
              setActiveView("studio");
            }}
            className="group relative flex cursor-pointer flex-col justify-between rounded-xl border border-border bg-surface p-6 transition-all duration-150 hover:border-accent/40 hover:bg-elevated hover:shadow-lg"
          >
            <div>
              <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-elevated text-accent transition-colors group-hover:bg-accent group-hover:text-accent-fg hairline">
                <Sparkles className="size-6" />
              </div>
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-medium text-fg">
                  Explore Demo
                </h2>
                <span className="rounded-sm bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                  Ready
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Launch the studio immediately with pre-computed motion curves, review flags, and a
                synthetic motion stage.
              </p>
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4">
              <span className="text-xs text-subtle">Zero-upload sandbox</span>
              <span className="flex items-center gap-1 text-xs font-medium text-accent group-hover:underline">
                Launch demo <PlayCircle className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </div>
        </section>

        {/* Active Project Resume Banner (if available) */}
        {hasActiveSession && (
          <section className="mt-8 rounded-xl border border-accent/20 bg-elevated/80 p-5 backdrop-blur-xs hairline">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3.5">
                <div className="flex size-10 items-center justify-center rounded-lg bg-surface text-accent hairline">
                  <Layers className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-[0.12em] text-subtle">
                      Current In-Memory Session
                    </span>
                    <span className="size-1.5 rounded-full bg-ok" />
                  </div>
                  <h3 className="font-display text-base font-medium text-fg">
                    {meta.title || "Untitled Session"}
                  </h3>
                  <p className="text-xs text-muted">
                    {actionsCount} actions · {formatTimecode(meta.durationMs)} duration ·{" "}
                    {meta.sourceKind === "video"
                      ? "Video linked"
                      : meta.sourceKind === "demo"
                        ? "Demo simulation"
                        : "Script only"}
                  </p>
                </div>
              </div>
              <Button onClick={() => setActiveView("studio")} className="gap-2 self-start sm:self-center">
                Return to Workspace
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </section>
        )}

        {/* Recent Projects Section */}
        <section className="mt-12">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-muted" />
              <h2 className="text-sm font-semibold tracking-wide uppercase text-fg">
                Recent Projects
              </h2>
            </div>
            <span className="text-xs text-subtle">
              Phase 5 Local Storage
            </span>
          </div>

          {/* Clean architectural placeholder card as specified */}
          <div className="rounded-xl border border-border bg-surface/50 p-6 text-center hairline">
            <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-elevated text-subtle mb-3">
              <FolderOpen className="size-5" />
            </div>
            <h3 className="text-sm font-medium text-fg">No saved local projects found</h3>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted">
              Persistent cross-session history will be activated in Phase 5 via local IndexedDB storage.
              When enabled, projects will track your video references, draft review status, and edit history.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2 text-left sm:grid-cols-4 max-w-2xl mx-auto border-t border-border/40 pt-4 text-[11px] text-subtle">
              <div className="flex items-center gap-1.5">
                <Info className="size-3 text-subtle" />
                <span>Project Name & Video</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Info className="size-3 text-subtle" />
                <span>Analysis Status</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Info className="size-3 text-subtle" />
                <span>Script Review Progress</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Info className="size-3 text-subtle" />
                <span>Last Modified Stamp</span>
              </div>
            </div>
          </div>
        </section>

        {/* Workflow Guidance Footer */}
        <section className="mt-12 rounded-lg border border-border/60 bg-surface/30 p-4">
          <p className="text-xs text-subtle text-center">
            Workflow: <span className="text-fg">Video Ingestion</span> →{" "}
            <span className="text-muted">Motion Analysis</span> →{" "}
            <span className="text-muted">Draft Generation</span> →{" "}
            <span className="text-muted">Human Review</span> →{" "}
            <span className="text-muted">Funscript Export</span>
          </p>
        </section>
      </main>
    </div>
  );
}
