import React from "react";
import { ZoomIn, ZoomOut, Maximize2, Move } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/lib/cadence/store";
import { cn } from "@/lib/utils";

type Props = {
  isPanMode: boolean;
  onTogglePanMode: () => void;
};

export function ViewerZoomControls({ isPanMode, onTogglePanMode }: Props) {
  const zoom = useStudio((s) => s.viewerTransform.zoom);
  const setZoom = useStudio((s) => s.setViewerZoom);
  const reset = useStudio((s) => s.resetViewerTransform);

  return (
    <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1 rounded-lg border border-zinc-700/80 bg-zinc-900/90 p-1 shadow-lg backdrop-blur-sm">
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-zinc-300 hover:text-white"
        onClick={() => setZoom(Math.max(1, zoom - 0.25))}
        title="Zoom out"
      >
        <ZoomOut className="h-4 w-4" />
      </Button>
      <span className="min-w-[3.5rem] text-center text-xs tabular-nums text-zinc-400">
        {Math.round(zoom * 100)}%
      </span>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-zinc-300 hover:text-white"
        onClick={() => setZoom(Math.min(8, zoom + 0.25))}
        title="Zoom in"
      >
        <ZoomIn className="h-4 w-4" />
      </Button>
      <div className="mx-1 h-4 w-px bg-zinc-700" />
      <Button
        size="icon"
        variant="ghost"
        className={cn(
          "h-8 w-8 text-zinc-300 hover:text-white",
          isPanMode && "bg-zinc-700 text-white"
        )}
        onClick={onTogglePanMode}
        title="Pan mode"
      >
        <Move className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-zinc-300 hover:text-white"
        onClick={reset}
        title="Reset view"
      >
        <Maximize2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
