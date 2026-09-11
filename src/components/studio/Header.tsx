import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/lib/cadence/store";

type Props = {
  onExport: () => void;
  onHelp: () => void;
};

export function Header({ onExport, onHelp }: Props) {
  const videoInput = useRef<HTMLInputElement>(null);
  const scriptInput = useRef<HTMLInputElement>(null);
  const title = useStudio((s) => s.meta.title);
  const sourceKind = useStudio((s) => s.meta.sourceKind);
  const dirty = useStudio((s) => s.dirty);
  const actions = useStudio((s) => s.actions.length);
  const loadVideoFile = useStudio((s) => s.loadVideoFile);
  const importScript = useStudio((s) => s.importScript);
  const resetDemo = useStudio((s) => s.resetDemo);
  const setToast = useStudio((s) => s.setToast);

  return (
    <header className="flex items-center gap-3 border-b border-border bg-surface px-3 py-2.5 sm:px-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <h1 className="font-display text-xl leading-none tracking-tight sm:text-2xl">Cadence</h1>
          <span className="hidden text-[11px] uppercase tracking-[0.16em] text-subtle sm:inline">
            Script studio
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">
          {title}
          {dirty ? " · unsaved edits" : ""}
          <span className="text-subtle"> · {actions} actions</span>
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Button variant="ghost" size="sm" onClick={onHelp} className="hidden sm:inline-flex">
          Keys
        </Button>
        <Button variant="ghost" size="sm" onClick={resetDemo}>
          Demo
        </Button>
        <Button variant="outline" size="sm" onClick={() => scriptInput.current?.click()}>
          Import
        </Button>
        <Button variant="outline" size="sm" onClick={() => videoInput.current?.click()}>
          Open video
        </Button>
        <Button size="sm" onClick={onExport}>
          Export
        </Button>
      </div>

      <input
        ref={videoInput}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void loadVideoFile(file);
        }}
      />
      <input
        ref={scriptInput}
        type="file"
        accept=".funscript,application/json,.json"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            importScript(await file.text(), file.name);
          } catch (err) {
            setToast(err instanceof Error ? err.message : "Could not read script.");
          }
        }}
      />
      <span className="sr-only">{sourceKind}</span>
    </header>
  );
}
