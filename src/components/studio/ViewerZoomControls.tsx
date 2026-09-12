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
  const viewerTransform = useStudio((s) => s.viewerTransform);
  const setViewerZoom = useStudio((s) => s.setViewerZoom);
  const resetViewerTransform = useStudio((s) => s.resetViewerTransform);

  const zoomPercent = Math.round(viewerTransform.zoom * 100);

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewerZoom(viewerTransform.zoom * 1.25);
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewerZoom(viewerTransform.zoom / 1.25);
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    resetViewerTransform();
  };

  return (
    <div
      className="absolute bottom-3 right-3 z-30 flex items-center gap-1 rounded-md border border-border/80 bg-surface/90 p-1 shadow-lg backdrop-blur-md select-none"
      onClick={(e) => e.stopPropagation()}
    >
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={handleZoomOut}
        disabled={viewerTransform.zoom <= 1.01}
        className="size-7 rounded text-muted hover:text-fg hover:bg-elevated/80 disabled:opacity-35"
        title="Zoom Out (-)"
      >
        <ZoomOut className="size-3.5" />
      </Button>

      <button
        type="button"
        onClick={handleReset}
        className="min-w-12 px-1 text-center font-mono text-xs font-semibold tabular text-fg hover:text-accent transition-colors"
        title="Reset Zoom & Pan (Fit 100%)"
      >
        {zoomPercent}%
      </button>

      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={handleZoomIn}
        disabled={viewerTransform.zoom >= 7.9}
        className="size-7 rounded text-muted hover:text-fg hover:bg-elevated/80 disabled:opacity-35"
        title="Zoom In (+)"
      >
        <ZoomIn className="size-3.5" />
      </Button>

      <div className="mx-0.5 h-4 w-px bg-border/80" />

      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={onTogglePanMode}
        className={cn(
          "size-7 rounded transition-colors",
          isPanMode ? "bg-accent text-accent-fg" : "text-muted hover:text-fg hover:bg-elevated/80",
        )}
        title={isPanMode ? "Pan tool active (drag video to pan)" : "Pan tool (or hold Space to drag)"}
      >
        <Move className="size-3.5" />
      </Button>

      {viewerTransform.zoom > 1.05 && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={handleReset}
          className="size-7 rounded text-muted hover:text-fg hover:bg-elevated/80"
          title="Reset transform to 100%"
        >
          <Maximize2 className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
