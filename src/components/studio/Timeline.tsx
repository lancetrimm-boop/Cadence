import { useEffect, useRef, useState, type PointerEvent as PE } from "react";
import { formatTimecode } from "@/lib/cadence/format";
import { useStudio, viewWindow } from "@/lib/cadence/store";
import type { Action, MotionSample } from "@/lib/cadence/types";

const PAD_L = 72;
const PAD_R = 16;
const RULER_H = 24;
const FLAG_H = 12;

function laneGeometry(h: number) {
  const top = RULER_H + FLAG_H + 8;
  const usable = Math.max(48, h - top - 10);
  const motionH = Math.round(usable * 0.36);
  const gap = 12;
  const scriptY = top + motionH + gap;
  const scriptH = Math.max(56, h - scriptY - 8);
  return { top, motionH, scriptY, scriptH };
}

function xAt(t: number, start: number, span: number, innerW: number) {
  return PAD_L + ((t - start) / span) * innerW;
}
function tAt(x: number, start: number, span: number, innerW: number) {
  return start + ((x - PAD_L) / innerW) * span;
}
function posY(pos: number, y: number, h: number) {
  return y + (1 - pos / 100) * h;
}
function yToPos(py: number, y: number, h: number) {
  return Math.round(Math.min(100, Math.max(0, (1 - (py - y) / h) * 100)));
}

type Drag =
  | { kind: "seek" }
  | { kind: "pan"; x: number; start: number }
  | { kind: "point"; id: string };

export function Timeline() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [size, setSize] = useState({ w: 800, h: 240 });
  const [hover, setHover] = useState<{ t: number; pos: number } | null>(null);

  const samples = useStudio((s) => s.samples);
  const actions = useStudio((s) => s.actions);
  const flags = useStudio((s) => s.flags);
  const playheadMs = useStudio((s) => s.playheadMs);
  const selectedId = useStudio((s) => s.selectedId);
  const zoom = useStudio((s) => s.zoom);
  const viewStartMs = useStudio((s) => s.viewStartMs);
  const durationMs = useStudio((s) => s.meta.durationMs);
  const setPlayhead = useStudio((s) => s.setPlayhead);
  const setViewStart = useStudio((s) => s.setViewStart);
  const setZoom = useStudio((s) => s.setZoom);
  const select = useStudio((s) => s.select);
  const moveAction = useStudio((s) => s.moveAction);
  const addAction = useStudio((s) => s.addAction);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const apply = () => setSize({ w: wrap.clientWidth, h: wrap.clientHeight });
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const state = useStudio.getState();
      const { start, span } = viewWindow(state);
      if (e.ctrlKey || e.metaKey) {
        setZoom(state.zoom * (e.deltaY > 0 ? 0.9 : 1.1));
      } else {
        setViewStart(start + (e.deltaY + e.deltaX) * (span / 600));
      }
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, [setZoom, setViewStart]);

  const { start, span } = viewWindow({
    zoom,
    viewStartMs,
    meta: { durationMs, title: "", sourceKind: "demo", sourceName: "" },
  });
  const innerW = Math.max(1, size.w - PAD_L - PAD_R);
  const { top, motionH, scriptY, scriptH } = laneGeometry(size.h);
  const end = start + span;

  const hitPoint = (x: number, y: number): Action | null => {
    let best: Action | null = null;
    let bestD = 16;
    for (const a of actions) {
      const ax = xAt(a.at, start, span, innerW);
      const ay = posY(a.pos, scriptY, scriptH);
      const d = Math.hypot(ax - x, ay - y);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return best;
  };

  const localXY = (e: PE<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: PE<SVGSVGElement>) => {
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    const { x, y } = localXY(e);
    if (e.button === 1 || e.shiftKey) {
      drag.current = { kind: "pan", x, start };
      return;
    }
    const point = hitPoint(x, y);
    if (point) {
      select(point.id);
      drag.current = { kind: "point", id: point.id };
      return;
    }
    if (y >= scriptY && y <= scriptY + scriptH && x >= PAD_L) {
      const t = tAt(x, start, span, innerW);
      addAction(t, yToPos(y, scriptY, scriptH));
      const id = useStudio.getState().selectedId;
      if (id) drag.current = { kind: "point", id };
      return;
    }
    if (x >= PAD_L) {
      setPlayhead(tAt(x, start, span, innerW), true);
      drag.current = { kind: "seek" };
    }
  };

  const onPointerMove = (e: PE<SVGSVGElement>) => {
    const { x, y } = localXY(e);
    const t = tAt(x, start, span, innerW);
    const pos = yToPos(y, scriptY, scriptH);
    setHover({ t, pos: hitPoint(x, y)?.pos ?? pos });
    const d = drag.current;
    if (!d) return;
    if (d.kind === "seek") setPlayhead(t, true);
    else if (d.kind === "pan") setViewStart(d.start + ((d.x - x) / innerW) * span);
    else moveAction(d.id, t, pos);
  };

  const motionPath = buildMotionPath(samples, start, end, span, innerW, top, motionH);
  const scriptPts = actions
    .filter((a) => a.at >= start - 400 && a.at <= end + 400)
    .map((a) => `${xAt(a.at, start, span, innerW).toFixed(1)},${posY(a.pos, scriptY, scriptH).toFixed(1)}`)
    .join(" ");
  const px = xAt(playheadMs, start, span, innerW);
  const ticks = rulerTicks(start, span);

  return (
    <div ref={wrapRef} className="relative h-56 bg-bg md:h-64">
      <svg
        width={size.w}
        height={size.h}
        className="h-full w-full touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerLeave={() => {
          if (!drag.current) setHover(null);
        }}
        role="application"
        aria-label="Motion and script timeline"
      >
        <rect width={size.w} height={size.h} fill="var(--color-bg)" />
        <rect x={PAD_L} y={top} width={innerW} height={motionH} fill="var(--color-elevated)" rx="4" />
        <rect x={PAD_L} y={scriptY} width={innerW} height={scriptH} fill="var(--color-elevated)" rx="4" />
        <defs>
          <clipPath id="cadence-motion">
            <rect x={PAD_L} y={top} width={innerW} height={motionH} rx="4" />
          </clipPath>
          <clipPath id="cadence-script">
            <rect x={PAD_L} y={scriptY} width={innerW} height={scriptH} rx="4" />
          </clipPath>
        </defs>

        {ticks.map((t) => {
          const x = xAt(t, start, span, innerW);
          return (
            <g key={t}>
              <line
                x1={x}
                x2={x}
                y1={RULER_H}
                y2={size.h}
                stroke="color-mix(in oklab, var(--color-fg) 10%, transparent)"
              />
              <text
                x={x + 4}
                y={14}
                fill="var(--color-muted)"
                fontSize="10"
                fontFamily="Outfit, sans-serif"
              >
                {formatTimecode(t, span < 8000)}
              </text>
            </g>
          );
        })}

        {flags.map((f) => {
          const x = xAt(f.t, start, span, innerW);
          const w = Math.max(4, xAt(f.t + f.duration, start, span, innerW) - x);
          const fill =
            f.kind === "camera"
              ? "var(--color-warn)"
              : f.kind === "cut"
                ? "var(--color-danger)"
                : f.kind === "inactive"
                  ? "var(--color-ok)"
                  : "var(--color-signal)";
          return (
            <rect
              key={f.id}
              x={x}
              y={RULER_H + 3}
              width={w}
              height={FLAG_H - 2}
              rx={2}
              fill={fill}
              opacity={0.9}
            />
          );
        })}

        <g clipPath="url(#cadence-motion)">
          {motionPath.area ? <path d={motionPath.area} fill="var(--color-signal)" opacity={0.35} /> : null}
          {motionPath.line ? (
            <path d={motionPath.line} fill="none" stroke="var(--color-signal)" strokeWidth={2} />
          ) : null}
        </g>

        <g clipPath="url(#cadence-script)">
          {[0, 50, 100].map((p) => (
            <g key={p}>
              <line
                x1={PAD_L}
                x2={PAD_L + innerW}
                y1={posY(p, scriptY, scriptH)}
                y2={posY(p, scriptY, scriptH)}
                stroke="color-mix(in oklab, var(--color-fg) 12%, transparent)"
              />
              <text
                x={PAD_L + innerW - 6}
                y={posY(p, scriptY, scriptH) - 3}
                textAnchor="end"
                fill="var(--color-subtle)"
                fontSize="9"
                fontFamily="Outfit, sans-serif"
              >
                {p}
              </text>
            </g>
          ))}

          {scriptPts ? (
            <polyline
              points={scriptPts}
              fill="none"
              stroke="var(--color-fg)"
              strokeWidth={1.6}
              opacity={0.85}
            />
          ) : null}

          {actions.map((a) => {
            if (a.at < start - 80 || a.at > end + 80) return null;
            const sel = a.id === selectedId;
            return (
              <circle
                key={a.id}
                cx={xAt(a.at, start, span, innerW)}
                cy={posY(a.pos, scriptY, scriptH)}
                r={sel ? 5.5 : 3.4}
                fill={sel ? "var(--color-accent)" : "var(--color-fg)"}
                stroke="var(--color-bg)"
                strokeWidth={sel ? 2 : 1}
              />
            );
          })}
        </g>

        {px >= PAD_L - 2 && px <= PAD_L + innerW + 2 ? (
          <g>
            <line
              x1={px}
              x2={px}
              y1={0}
              y2={size.h}
              stroke="var(--color-accent)"
              strokeWidth={1.5}
            />
            <polygon
              points={`${px - 6},0 ${px + 6},0 ${px},10`}
              fill="var(--color-accent)"
            />
          </g>
        ) : null}

        <text
          x={10}
          y={top + motionH / 2}
          fill="var(--color-muted)"
          fontSize="10"
          fontFamily="Outfit, sans-serif"
          fontWeight={500}
        >
          MOTION
        </text>
        <text
          x={10}
          y={scriptY + scriptH / 2}
          fill="var(--color-muted)"
          fontSize="10"
          fontFamily="Outfit, sans-serif"
          fontWeight={500}
        >
          SCRIPT
        </text>

        {hover ? (
          <g>
            <rect
              x={Math.min(size.w - 118, Math.max(PAD_L, xAt(hover.t, start, span, innerW) + 8))}
              y={4}
              width={110}
              height={18}
              rx={4}
              fill="var(--color-bg)"
              stroke="color-mix(in oklab, var(--color-fg) 14%, transparent)"
            />
            <text
              x={Math.min(size.w - 118, Math.max(PAD_L, xAt(hover.t, start, span, innerW) + 8)) + 8}
              y={16}
              fill="var(--color-fg)"
              fontSize="11"
              fontFamily="Outfit, sans-serif"
            >
              {formatTimecode(hover.t)} {hover.pos}
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

function buildMotionPath(
  samples: MotionSample[],
  start: number,
  end: number,
  span: number,
  innerW: number,
  y: number,
  h: number,
) {
  const pts: Array<{ x: number; y: number }> = [];
  for (const s of samples) {
    if (s.t < start - 80) continue;
    if (s.t > end + 80) break;
    pts.push({
      x: xAt(s.t, start, span, innerW),
      y: y + (1 - s.pos) * h,
    });
  }
  if (pts.length === 0) return { area: "", line: "" };
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const area = `M${pts[0]!.x.toFixed(1)} ${(y + h).toFixed(1)} ${pts.map((p) => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")} L${pts[pts.length - 1]!.x.toFixed(1)} ${(y + h).toFixed(1)} Z`;
  return { area, line };
}

function rulerTicks(start: number, span: number): number[] {
  const raw = span / 8;
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const n = raw / pow;
  const step = n < 1.5 ? pow : n < 3.5 ? 2 * pow : n < 7.5 ? 5 * pow : 10 * pow;
  const first = Math.floor(start / step) * step;
  const ticks: number[] = [];
  for (let t = first; t <= start + span + step; t += step) ticks.push(t);
  return ticks;
}
