import { useEffect, useRef, useState } from 'react';
import type { Circuit, Probe } from '../types/circuit';
import { TPS, type LiveSimulator } from '../engine/simulator';
import { ANALOG_BASE, isAnalog, type Recorder } from '../engine/recorder';

interface Props {
  sim: LiveSimulator;
  circuit: Circuit;
  onChange: (next: Circuit, pushHistory: boolean) => void;
  collapsed: boolean;
  onToggle: () => void;
}

const ROW_H = 30;
const TOP_H = 22; // clock-edge arrows + async markers
const STATE_H = 24; // counter state per interval
const AXIS_H = 16;
const LABEL_W = 116;
/** Pulses this short (ticks) between two opposite levels are flagged as glitches. */
export const GLITCH_TICKS = 3;
const FONT = 'VT323, "JetBrains Mono", monospace';

const C = {
  bg: '#0b0e1c',
  row: '#0f1221',
  rowAlt: '#11152a',
  grid: '#1a1f38',
  hi: '#ffc94a',
  clk: '#4de8ff',
  lo: '#6f7bb8',
  z: '#59607a',
  bad: '#ff4d5e',
  pre: '#ffb02e',
  text: '#c9d1ff',
  muted: '#59607a',
};

interface Run {
  code: number;
  s: number; // start index (inclusive)
  e: number; // end index (exclusive)
}
function runsOf(arr: number[], i0: number, i1: number): Run[] {
  const out: Run[] = [];
  for (let i = i0; i < i1; i++) {
    const v = arr[i] ?? -1;
    const last = out[out.length - 1];
    if (last && last.code === v) last.e = i + 1;
    else out.push({ code: v, s: i, e: i + 1 });
  }
  return out;
}

export default function TimingDiagram({ sim, circuit, onChange, collapsed, onToggle }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const [zoom, setZoom] = useState(3); // px per tick
  const view = useRef({ end: 0 });
  const [, setPoll] = useState(0);
  const probes = circuit.probes ?? [];
  const hasCounter = sim.compiled.counterFFs.length > 0;
  const height = TOP_H + Math.max(1, probes.length) * ROW_H + (hasCounter ? STATE_H : 0) + AXIS_H;

  const stateRef = useRef({ follow, zoom, probes, hasCounter, height });
  stateRef.current = { follow, zoom, probes, hasCounter, height };

  // Re-render labels a few times a second (live values).
  useEffect(() => {
    if (collapsed) return;
    const id = setInterval(() => setPoll((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [collapsed]);

  useEffect(() => {
    if (collapsed) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    const frame = () => {
      draw(ctx, canvas);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        setZoom((z) => Math.max(0.5, Math.min(16, z * Math.exp(-e.deltaY * 0.002))));
      } else {
        const rec = sim.recorder;
        const last = rec.times[rec.length - 1] ?? 0;
        const cur = stateRef.current.follow ? last : view.current.end;
        view.current.end = Math.min(last, cur + (e.deltaY + e.deltaX) / stateRef.current.zoom);
        setFollow(view.current.end >= last);
      }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('wheel', onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, sim]);

  function draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    const { follow: fol, zoom: px, probes: prs, hasCounter: hc, height: H } = stateRef.current;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const W = Math.max(50, wrap.clientWidth - LABEL_W);
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    const rec: Recorder = sim.recorder;
    const n = rec.length;
    const lastT = n ? rec.times[n - 1] : 0;
    const endT = fol ? lastT : Math.min(view.current.end, lastT);
    if (fol) view.current.end = lastT;
    const span = W / px;
    const startT = endT - span + 2;
    const xOf = (t: number) => (t - startT) * px;
    const i0 = Math.max(0, rec.indexAt(startT) - 1);
    const i1 = Math.min(n, rec.indexAt(endT + 1));

    // rows background
    prs.forEach((_, r) => {
      ctx.fillStyle = r % 2 ? C.rowAlt : C.row;
      ctx.fillRect(0, TOP_H + r * ROW_H, W, ROW_H);
    });
    const rowsBottom = TOP_H + Math.max(1, prs.length) * ROW_H;

    // time axis
    const stepT = niceStep(70 / px);
    ctx.font = `12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let t = Math.ceil(startT / stepT) * stepT; t <= endT; t += stepT) {
      const x = xOf(t);
      ctx.fillStyle = C.grid;
      ctx.fillRect(x, TOP_H, 1, rowsBottom - TOP_H);
      ctx.fillStyle = C.muted;
      ctx.fillText(`${(t / TPS).toFixed(stepT < 10 ? 2 : 1)}s`, x, H - AXIS_H / 2);
    }

    // active clock edges
    const edges: number[] = []; // indices where an active edge happens
    const rising = rec.activeEdge === 'rising';
    for (let i = Math.max(1, i0); i < i1; i++) {
      const a = rec.clock[i - 1];
      const b = rec.clock[i];
      if (a < 0 || b < 0 || a === b) continue;
      if ((rising && b === 1) || (!rising && b === 0)) edges.push(i);
    }
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(77,232,255,0.45)';
    ctx.lineWidth = 1;
    for (const i of edges) {
      const x = Math.round(xOf(rec.times[i])) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, TOP_H - 4);
      ctx.lineTo(x, rowsBottom + (hc ? STATE_H : 0));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = C.clk;
    for (const i of edges) ctx.fillText(rising ? '↑' : '↓', xOf(rec.times[i]), 10);

    // async PRE / CLR markers
    ctx.font = `12px ${FONT}`;
    for (const ev of rec.events) {
      if (ev.t < startT || ev.t > endT) continue;
      const x = Math.round(xOf(ev.t)) + 0.5;
      const col = ev.kind === 'CLR' ? C.bad : C.pre;
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.18;
      ctx.fillRect(x - 3, TOP_H, 6, rowsBottom - TOP_H);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.moveTo(x, 2);
      ctx.lineTo(x, rowsBottom);
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillText(`${ev.kind}!`, x + 3, 9);
      ctx.textAlign = 'center';
    }

    // waveforms
    prs.forEach((p, r) => {
      const arr = rec.tracks.get(p.id);
      if (!arr) return;
      const yTop = TOP_H + r * ROW_H + 6;
      const yBot = TOP_H + (r + 1) * ROW_H - 6;
      const yMid = (yTop + yBot) / 2;
      // Analog track (capacitor charge / inductor current): draw a curve.
      let analog = false;
      for (let i = Math.max(0, i0); i < i1 && !analog; i++) analog = isAnalog(arr[i] ?? -1);
      if (analog) {
        const yv = (code: number) => (isAnalog(code) ? yBot - ((code - ANALOG_BASE) / 100) * (yBot - yTop) : code === 1 ? yTop : yBot);
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = 'rgba(201,209,255,0.35)';
        ctx.beginPath();
        ctx.moveTo(0, yMid);
        ctx.lineTo(W, yMid);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        let started = false;
        let lastX = 0;
        let lastY = yBot;
        for (let i = Math.max(0, i0); i < i1; i++) {
          const v = arr[i];
          if (v === undefined || v < 0 || v === 2 || v === 3) {
            started = false;
            continue;
          }
          const x = xOf(rec.times[i]);
          const y = yv(v);
          if (!started) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          started = true;
          lastX = x;
          lastY = y;
        }
        ctx.strokeStyle = C.clk;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineWidth = 1;
        const last = arr[i1 - 1];
        if (last !== undefined && isAnalog(last)) {
          ctx.fillStyle = C.clk;
          ctx.font = `12px ${FONT}`;
          ctx.textAlign = 'right';
          ctx.fillText(`${last - ANALOG_BASE}%`, Math.min(W - 4, lastX + 30), Math.max(yTop + 4, lastY - 6));
          ctx.textAlign = 'center';
        }
        return;
      }
      const runs = runsOf(arr, Math.max(0, i0 - 8), i1);
      const isClk = /CLK/i.test(p.label);
      runs.forEach((run, k) => {
        if (run.code < 0) return;
        const x0 = xOf(rec.times[run.s]);
        const x1 = run.e < n ? xOf(rec.times[run.e]) : xOf(rec.times[run.e - 1]) + px;
        if (x1 < 0 || x0 > W) return;
        const prev = runs[k - 1];
        const next = runs[k + 1];
        const glitch =
          run.code <= 1 && run.e - run.s <= GLITCH_TICKS && prev && next && prev.code === 1 - run.code && next.code === 1 - run.code;
        if (run.code === 2) {
          ctx.strokeStyle = C.z;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(x0, yMid);
          ctx.lineTo(x1, yMid);
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (run.code === 3) {
          ctx.fillStyle = 'rgba(255,77,94,0.35)';
          ctx.fillRect(x0, yTop, x1 - x0, yBot - yTop);
        } else {
          const y = run.code === 1 ? yTop : yBot;
          const col = glitch ? C.bad : run.code === 1 ? (isClk ? C.clk : C.hi) : C.lo;
          if (run.code === 1 && !glitch) {
            ctx.fillStyle = isClk ? 'rgba(77,232,255,0.10)' : 'rgba(255,201,74,0.10)';
            ctx.fillRect(x0, yTop, x1 - x0, yBot - yTop);
          }
          if (glitch) {
            ctx.fillStyle = 'rgba(255,77,94,0.30)';
            ctx.fillRect(x0 - 1, yTop - 2, Math.max(3, x1 - x0) + 2, yBot - yTop + 4);
          }
          ctx.strokeStyle = col;
          ctx.lineWidth = 2;
          ctx.beginPath();
          // vertical transition from previous level
          if (prev && prev.code >= 0 && prev.code <= 1) ctx.moveTo(x0, prev.code === 1 ? yTop : yBot);
          else ctx.moveTo(x0, y);
          ctx.lineTo(x0, y);
          ctx.lineTo(Math.max(x1, x0 + 1), y);
          ctx.stroke();
          ctx.lineWidth = 1;
          if (glitch && x1 - x0 < 40) {
            ctx.fillStyle = C.bad;
            ctx.font = `11px ${FONT}`;
            ctx.fillText('glitch', (x0 + x1) / 2, yMid);
          }
        }
      });
    });

    // counter state per clock interval
    if (hc) {
      const y = rowsBottom + STATE_H / 2;
      ctx.fillStyle = '#0d1124';
      ctx.fillRect(0, rowsBottom, W, STATE_H);
      const bits = rec.counterBits;
      const names = Array.from({ length: bits }, (_, i) => `Q${bits - 1 - i}`).join('');
      const bounds = [Math.max(0, i0), ...edges, i1];
      ctx.textAlign = 'center';
      for (let k = 0; k + 1 < bounds.length; k++) {
        const a = bounds[k];
        const b = bounds[k + 1];
        if (b - 1 < a) continue;
        const v = rec.counter[b - 1];
        if (v === undefined || v < 0) continue;
        const xa = Math.max(0, xOf(rec.times[a]));
        const xb = Math.min(W, b < n ? xOf(rec.times[b]) : xOf(rec.times[b - 1]) + px);
        const w = xb - xa;
        const bin = v.toString(2).padStart(bits, '0');
        const full = `${names} = ${bin} (${v})`;
        const mid = `${bin} (${v})`;
        ctx.font = `14px ${FONT}`;
        const label = ctx.measureText(full).width < w - 6 ? full : ctx.measureText(mid).width < w - 4 ? mid : w > 10 ? String(v) : '';
        ctx.fillStyle = C.hi;
        if (label) ctx.fillText(label, (xa + xb) / 2, y);
      }
    }

    // "now" cursor
    if (fol && n) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(xOf(lastT) + px - 1, TOP_H, 1, rowsBottom - TOP_H);
    }
    if (!prs.length) {
      ctx.fillStyle = C.muted;
      ctx.font = `16px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('No signals pinned — select a pin or wire and use “+” in the Inspector, or hover it and press P', W / 2, TOP_H + ROW_H / 2);
    }
  }

  const rename = (p: Probe, label: string) =>
    onChange({ ...circuit, probes: probes.map((q) => (q.id === p.id ? { ...q, label } : q)) }, false);
  const remove = (p: Probe) => onChange({ ...circuit, probes: probes.filter((q) => q.id !== p.id) }, true);
  const move = (p: Probe, d: -1 | 1) => {
    const i = probes.indexOf(p);
    const j = i + d;
    if (j < 0 || j >= probes.length) return;
    const next = [...probes];
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ ...circuit, probes: next }, true);
  };
  const liveCode = (p: Probe) => {
    const arr = sim.recorder.tracks.get(p.id);
    return arr ? arr[arr.length - 1] : -1;
  };

  return (
    <section className="shrink-0 border-t-2 border-edge bg-[#0b0e1c]">
      <div className="flex items-center gap-2 border-b border-edge px-3 py-1">
        <button className="truncate whitespace-nowrap font-pixel text-lg tracking-widest text-glow-cyan" onClick={onToggle}>
          {collapsed ? '▸' : '▾'} TIMING DIAGRAM / WAVEFORM VIEW
        </button>
        <span className="hidden whitespace-nowrap text-[10px] text-slate-500 xl:inline">giản đồ xung · {probes.length} signal{probes.length === 1 ? '' : 's'}</span>
        {!collapsed && (
          <div className="ml-auto flex items-center gap-1.5">
            <button className={`btn ${follow ? 'btn-on' : ''}`} onClick={() => setFollow((f) => !f)} title="Follow live time">
              {follow ? '● LIVE' : '❚❚ VIEW'}
            </button>
            <button className="btn" onClick={() => setZoom((z) => Math.max(0.5, z / 1.5))} title="Zoom out (Ctrl+wheel)">
              −
            </button>
            <span className="w-12 text-center text-[10px] tabular-nums text-slate-400">{zoom.toFixed(1)}px/t</span>
            <button className="btn" onClick={() => setZoom((z) => Math.min(16, z * 1.5))} title="Zoom in">
              +
            </button>
            <button className="btn" onClick={() => sim.recorder.clear()}>
              Clear
            </button>
          </div>
        )}
      </div>
      {!collapsed && (
        <div ref={wrapRef} className="scroll-thin flex max-h-[340px] overflow-y-auto">
          <div className="shrink-0 border-r border-edge bg-panel" style={{ width: LABEL_W }}>
            <div style={{ height: TOP_H }} className="px-2 text-[10px] leading-[22px] text-slate-500">
              {sim.compiled.mainClock ? `edges ${sim.recorder.activeEdge === 'rising' ? '↑' : '↓'}` : 'no clock'}
            </div>
            {probes.map((p) => {
              const code = liveCode(p);
              return (
                <div key={p.id} style={{ height: ROW_H }} className="group flex items-center gap-1 px-1.5">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${isAnalog(code) ? 'bg-glow-cyan shadow-[0_0_6px_#4de8ff]' : code === 1 ? 'bg-glow-amber shadow-[0_0_6px_#ffc94a]' : code === 0 ? 'bg-[#3b4466]' : code === 3 ? 'bg-glow-red' : 'bg-slate-700'}`}
                  />
                  <input
                    value={p.label}
                    onChange={(e) => rename(p, e.target.value)}
                    className="w-full min-w-0 bg-transparent font-pixel text-base tracking-wide text-slate-200 outline-none focus:text-glow-amber"
                  />
                  <div className="hidden shrink-0 gap-0.5 group-hover:flex">
                    <button className="text-[10px] text-slate-500 hover:text-white" onClick={() => move(p, -1)} title="Move up">
                      ▲
                    </button>
                    <button className="text-[10px] text-slate-500 hover:text-white" onClick={() => move(p, 1)} title="Move down">
                      ▼
                    </button>
                    <button className="text-[11px] text-slate-500 hover:text-glow-red" onClick={() => remove(p)} title="Unpin">
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
            {!probes.length && <div style={{ height: ROW_H }} />}
            {hasCounter && (
              <div style={{ height: STATE_H }} className="px-2 font-pixel text-base leading-6 text-glow-amber">
                STATE
              </div>
            )}
          </div>
          <canvas ref={canvasRef} className="block" />
        </div>
      )}
    </section>
  );
}

function niceStep(minTicks: number) {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000, 2000, 5000];
  return steps.find((s) => s >= minTicks) ?? 10000;
}
