import React from "react";
import { AlertTriangle, Plus, CheckCircle2, RefreshCw, X, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/lib/cadence/store";
import { cn } from "@/lib/utils";

export function RecoveryModal() {
  const primarySetupStep = useStudio((s) => s.primarySetupStep);
  const failedPoint = useStudio((s) => s.failedPoint);
  const recoveryReferences = useStudio((s) => s.recoveryReferences);
  const proposedReacquisition = useStudio((s) => s.proposedReacquisition);
  const addRecoveryReference = useStudio((s) => s.addRecoveryReference);
  const removeRecoveryReference = useStudio((s) => s.removeRecoveryReference);
  const triggerAttemptReacquisition = useStudio((s) => s.triggerAttemptReacquisition);
  const confirmReacquisition = useStudio((s) => s.confirmReacquisition);
  const cancelRecovery = useStudio((s) => s.cancelRecovery);
  const minConfidenceThreshold = useStudio((s) => s.trackingSettings.minConfidenceThreshold);

  if (primarySetupStep !== "recovery") return null;

  const targetPointId = failedPoint === "B" ? "B" : "A";
  const confidencePct = proposedReacquisition ? Math.round(proposedReacquisition.confidence * 100) : 0;
  const isHypothesisStrong = confidencePct >= Math.round(minConfidenceThreshold * 100);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div className="w-full max-w-md rounded-xl border border-amber-500/50 bg-surface/95 p-5 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-amber-400">
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/15 border border-amber-500/30">
              <AlertTriangle className="size-4" />
            </div>
            <div>
              <h3 className="font-display text-sm font-semibold tracking-wide text-fg">
                Tracking Paused · Reacquisition Required
              </h3>
              <p className="text-[11px] text-muted">
                Primary Point {failedPoint === "both" ? "A & B" : failedPoint ?? "A"} lost visual lock
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={cancelRecovery}
            className="rounded p-1 text-subtle hover:text-fg hover:bg-elevated transition-colors"
            title="Dismiss recovery"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Diagnostic explanation */}
        <div className="mt-3.5 rounded-lg border border-border/80 bg-elevated/70 p-3 text-xs text-muted leading-relaxed">
          Tracking confidence dropped below the acceptable threshold (
          <span className="font-medium text-fg">{Math.round(minConfidenceThreshold * 100)}%</span>
          ). Add reference points on visible landmark features to reacquire position without losing your tracking history.
        </div>

        {/* Reference points list */}
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fg">
              Recovery Reference Points ({recoveryReferences.length})
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => addRecoveryReference()}
              className="h-7 px-2.5 text-xs gap-1 border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
            >
              <Plus className="size-3" />
              <span>Add Reference</span>
            </Button>
          </div>

          {recoveryReferences.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {recoveryReferences.map((ref) => (
                <div
                  key={ref.id}
                  className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-300"
                >
                  <span className="font-bold">{ref.label}:</span>
                  <span className="font-mono text-[11px] text-muted">
                    {Math.round(ref.x)}%, {Math.round(ref.y)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRecoveryReference(ref.id)}
                    className="ml-1 text-amber-400/60 hover:text-amber-200"
                    title="Remove reference point"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-subtle italic">
              Click "Add Reference" to drop anchor points around the feature on screen.
            </p>
          )}
        </div>

        {/* Reacquisition Hypothesis Result */}
        {proposedReacquisition && (
          <div className="mt-4 rounded-lg border border-border/90 bg-elevated/90 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-fg">Proposed Candidate Lock:</span>
              <span
                className={cn(
                  "font-mono font-bold text-xs px-2 py-0.5 rounded",
                  isHypothesisStrong
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : "bg-amber-500/15 text-amber-400 border border-amber-500/30",
                )}
              >
                {confidencePct}% Confidence
              </span>
            </div>
            <div className="mt-1.5 text-xs text-muted font-mono">
              Target Point {proposedReacquisition.pointId} at ({Math.round(proposedReacquisition.x)}%,{" "}
              {Math.round(proposedReacquisition.y)}%)
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="mt-5 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => triggerAttemptReacquisition(targetPointId)}
            className="h-8 text-xs text-muted hover:text-fg gap-1.5"
          >
            <RefreshCw className="size-3.5" />
            <span>Recalculate</span>
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={cancelRecovery}
              className="h-8 text-xs"
            >
              Cancel
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={confirmReacquisition}
              disabled={!proposedReacquisition}
              className="h-8 bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs gap-1.5 shadow-sm"
            >
              <CheckCircle2 className="size-3.5" />
              <span>Confirm & Resume</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
