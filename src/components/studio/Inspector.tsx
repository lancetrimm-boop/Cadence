import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FLAG_COPY } from "@/lib/cadence/flags";
import { formatMs, formatTimecode } from "@/lib/cadence/format";
import { amplitudeHistogram, positionHistogram } from "@/lib/cadence/stats";
import { STYLE_LIST } from "@/lib/cadence/style";
import { useScriptStats, useStudio } from "@/lib/cadence/store";
import type { FlagKind } from "@/lib/cadence/types";
import { cn } from "@/lib/utils";

const TABS = ["Review", "Style", "Stats", "Actions"] as const;
type Tab = (typeof TABS)[number];

export function Inspector() {
  const [tab, setTab] = useState<Tab>("Review");

  return (
    <aside className="area-inspector flex min-h-0 flex-col border-t border-border bg-surface md:border-t-0 md:border-l">
      <div className="flex items-center gap-1 px-3 pt-3">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "h-8 rounded-sm px-2.5 text-xs font-medium transition-colors duration-[var(--motion-quick)]",
              tab === t ? "bg-elevated text-fg" : "text-muted hover:text-fg",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {tab === "Review" ? (
          <ReviewPane />
        ) : tab === "Style" ? (
          <StylePane />
        ) : tab === "Stats" ? (
          <StatsPane />
        ) : (
          <ActionsPane />
        )}
      </div>
    </aside>
  );
}

function ReviewPane() {
  const flags = useStudio((s) => s.flags);
  const durationMs = useStudio((s) => s.meta.durationMs);
  const setPlayhead = useStudio((s) => s.setPlayhead);
  const playheadMs = useStudio((s) => s.playheadMs);
  const flagged = flags.reduce((s, f) => s + Math.max(f.duration, 80), 0);
  const coverage = durationMs > 0 ? Math.max(0, 1 - flagged / durationMs) : 1;
  const kinds: FlagKind[] = ["cut", "camera", "uncertain", "inactive", "unusual"];

  return (
    <div className="enter">
      <p className="text-xs uppercase tracking-[0.16em] text-subtle">Active learning</p>
      <h2 className="mt-1 font-display text-2xl leading-tight text-fg">
        {Math.round(coverage * 100)}% high confidence
      </h2>
      <p className="mt-1 text-sm text-muted">
        {flags.length === 0
          ? "No review marks on this take."
          : `${flags.length} sections worth a look. Skip the rest.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-subtle">
        {kinds.map((k) => (
          <span key={k}>{FLAG_COPY[k].title}</span>
        ))}
      </div>
      <ul className="mt-4 space-y-1.5">
        {flags.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => setPlayhead(f.t, true)}
              className={cn(
                "flex w-full flex-col rounded-md px-3 py-2.5 text-left transition-colors duration-[var(--motion-quick)]",
                Math.abs(playheadMs - f.t) < 400 ? "bg-elevated" : "hover:bg-elevated/70",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-fg">{f.label}</span>
                <span className="tabular text-xs text-muted">{formatTimecode(f.t, false)}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted">{f.detail}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StylePane() {
  const styleId = useStudio((s) => s.styleId);
  const setStyle = useStudio((s) => s.setStyle);
  const regenerate = useStudio((s) => s.regenerate);
  const samples = useStudio((s) => s.samples);
  const current = useStudio((s) => s.style);

  return (
    <div className="enter">
      <p className="text-xs uppercase tracking-[0.16em] text-subtle">Generator</p>
      <h2 className="mt-1 font-display text-2xl leading-tight">Scripting style</h2>
      <p className="mt-1 text-sm text-muted">
        Motion stays put. Only the conversion layer changes. Re-run without touching the video.
      </p>
      <div className="mt-4 grid gap-2">
        {STYLE_LIST.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStyle(s.id)}
            className={cn(
              "rounded-md px-3 py-2.5 text-left hairline transition-colors duration-[var(--motion-quick)]",
              styleId === s.id ? "bg-elevated" : "bg-transparent hover:bg-elevated/60",
            )}
          >
            <div className="text-sm font-medium text-fg">{s.name}</div>
            <p className="mt-0.5 text-xs text-muted">{s.blurb}</p>
          </button>
        ))}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <Stat label="Range" value={`${current.minPos}–${current.maxPos}`} />
        <Stat label="Up / down" value={`${current.upPoints} / ${current.downPoints}`} />
        <Stat label="Hold" value={formatMs(current.minHoldMs)} />
        <Stat label="Cadence skip" value={`${Math.round(current.cadenceSkip * 100)}%`} />
      </dl>
      <Button className="mt-4 w-full" onClick={regenerate} disabled={samples.length === 0}>
        Regenerate draft
      </Button>
    </div>
  );
}

function StatsPane() {
  const stats = useScriptStats();
  const actions = useStudio((s) => s.actions);
  const amp = amplitudeHistogram(actions);
  const pos = positionHistogram(actions);

  return (
    <div className="enter">
      <p className="text-xs uppercase tracking-[0.16em] text-subtle">Performance shape</p>
      <h2 className="mt-1 font-display text-2xl leading-tight">Script signature</h2>
      <p className="mt-1 text-sm text-muted">
        Characteristics of the current draft — not a score. Use them to stay close to your style.
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="Actions" value={String(stats.actions)} />
        <Stat label="Strokes" value={String(stats.strokes)} />
        <Stat label="Density" value={`${stats.densityPerMin.toFixed(0)} / min`} />
        <Stat label="Mean amp" value={stats.meanAmplitude.toFixed(0)} />
        <Stat label="Median stroke" value={formatMs(stats.medianStrokeMs)} />
        <Stat label="Up/down time" value={stats.upDownRatio.toFixed(2)} />
        <Stat label="Upper share" value={`${Math.round(stats.upperShare * 100)}%`} />
        <Stat label="Lower share" value={`${Math.round(stats.lowerShare * 100)}%`} />
        <Stat label="Holds" value={String(stats.holdCount)} />
        <Stat label="Range used" value={String(stats.rangeUsed)} />
      </dl>
      <p className="mt-5 text-xs uppercase tracking-[0.14em] text-subtle">Amplitude</p>
      <Bars values={amp} />
      <p className="mt-4 text-xs uppercase tracking-[0.14em] text-subtle">Time in position</p>
      <Bars values={pos} />
    </div>
  );
}

function ActionsPane() {
  const actions = useStudio((s) => s.actions);
  const selectedId = useStudio((s) => s.selectedId);
  const select = useStudio((s) => s.select);
  const setPlayhead = useStudio((s) => s.setPlayhead);
  const removeSelected = useStudio((s) => s.removeSelected);

  return (
    <div className="enter">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-2xl leading-tight">{actions.length} actions</h2>
        <Button variant="ghost" size="sm" onClick={removeSelected} disabled={!selectedId}>
          Delete
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted">Click a row to seek. Drag points on the timeline to edit.</p>
      <ul className="mt-3 divide-y divide-border">
        {actions.map((a, i) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => {
                select(a.id);
                setPlayhead(a.at, true);
              }}
              className={cn(
                "flex w-full items-center justify-between px-1 py-2 text-left text-sm tabular",
                a.id === selectedId ? "text-fg" : "text-muted hover:text-fg",
              )}
            >
              <span className="w-8 text-subtle">{i + 1}</span>
              <span>{formatTimecode(a.at)}</span>
              <span>{a.pos}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-elevated px-3 py-2">
      <dt className="text-xs uppercase tracking-[0.14em] text-subtle">{label}</dt>
      <dd className="mt-0.5 tabular text-sm text-fg">{value}</dd>
    </div>
  );
}

function Bars({ values }: { values: number[] }) {
  return (
    <div className="mt-2 flex h-14 items-end gap-1">
      {values.map((v, i) => (
        <div key={i} className="flex h-full flex-1 items-end rounded-xs bg-elevated">
          <div
            className="w-full rounded-xs bg-signal/80"
            style={{ height: `${Math.max(6, v * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
}
