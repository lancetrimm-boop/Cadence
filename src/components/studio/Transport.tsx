import React from 'react';
import {
  Pause,
  Play,
  Redo2,
  SkipBack,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTimecode } from "@/lib/cadence/format";
import { interpolatePos } from "@/lib/cadence/funscript";
import { useStudio } from "@/lib/cadence/store";

type Props = {
  onExport: () => void;
};

export function Transport({ onExport }: Props) {
  const playing = useStudio((s) => s.playing);
  const playheadMs = useStudio((s) => s.playheadMs);
  const durationMs = useStudio((s) => s.meta.durationMs);
  const zoom = useStudio((s) => s.zoom);
  const togglePlay = useStudio((s) => s.togglePlay);
  const setPlayhead = useStudio((s) => s.setPlayhead);
  const setZoom = useStudio((s) => s.setZoom);
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);
  const canUndo = useStudio((s) => s.history.length > 0);
  const canRedo = useStudio((s) => s.future.length > 0);
  const actions = useStudio((s) => s.actions);
  const pos = interpolatePos(actions, playheadMs);

  // Responsive breakpoint for transport button size (â‰¤640px => icon-sm)
  const [isSmall, setIsSmall] = React.useState(() => typeof window !== "undefined" && window.innerWidth <= 640);
  React.useEffect(() => {
    const handler = () => setIsSmall(window.innerWidth <= 640);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface px-3 py-2">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size={isSmall ? "icon-sm" : "icon"}
          aria-label="Jump to start"
          onClick={() => setPlayhead(0, true)}
        >
          <SkipBack />
        </Button>
        <Button
          variant="subtle"
          size={isSmall ? "icon-sm" : "icon"}
          aria-label={playing ? "Pause" : "Play"}
          onClick={togglePlay}
          className="size-11 rounded-md"
        >
          {playing ? <Pause className="size-5" /> : <Play className="size-5 ml-0.5" />}
        </Button>
      </div>

      <div className="min-w-[7.5rem] tabular text-sm text-fg">
        {formatTimecode(playheadMs)}
        <span className="text-subtle"> / {formatTimecode(durationMs, false)}</span>
      </div>

      <div className="hidden items-center gap-2 sm:flex">
        <span className="text-[10px] uppercase tracking-[0.14em] text-subtle">Pos</span>
        <span className="tabular text-sm">{Math.round(pos)}</span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size={isSmall ? "icon-sm" : "icon"} aria-label="Undo" disabled={!canUndo} onClick={undo}>
          <Undo2 />
        </Button>
        <Button variant="ghost" size={isSmall ? "icon-sm" : "icon"} aria-label="Redo" disabled={!canRedo} onClick={redo}>
          <Redo2 />
        </Button>
        <Button
          variant="ghost"
          size={isSmall ? "icon-sm" : "icon"}
          aria-label="Zoom out"
          onClick={() => setZoom(zoom / 1.25)}
        >
          <ZoomOut />
        </Button>
        <span className="w-10 text-center text-xs tabular text-muted">{zoom.toFixed(1)}Ã—</span>
        <Button
          variant="ghost"
          size={isSmall ? "icon-sm" : "icon"}
          aria-label="Zoom in"
          onClick={() => setZoom(zoom * 1.25)}
        >
          <ZoomIn />
        </Button>
        <Button variant="outline" size="sm" onClick={onExport} className="ml-1">
          Export
        </Button>
      </div>
    </div>
  );
}
