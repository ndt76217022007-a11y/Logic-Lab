import { useEffect, useState } from 'react';
import type { Circuit, CircuitComponent } from '../types/circuit';
import type { LiveSimulator } from '../engine/simulator';
import { ffDataPins, gateInputCount } from '../engine/componentDefs';
import { ffTruthTable, gateTruthTable, type TruthTableView } from '../engine/truthTables';
import { toBits, type CycleInfo } from '../engine/stateTracker';
import type { Selection } from './CircuitCanvas';

interface Props {
  sim: LiveSimulator;
  circuit: Circuit;
  selection: Selection;
  collapsed: boolean;
  onToggle: () => void;
}

export default function AnalysisPanel({ sim, circuit, selection, collapsed, onToggle }: Props) {
  const [, setPoll] = useState(0);
  useEffect(() => {
    if (collapsed) return;
    const id = setInterval(() => setPoll((n) => n + 1), 200);
    return () => clearInterval(id);
  }, [collapsed]);

  if (collapsed) {
    return (
      <aside className="flex w-9 flex-col items-center border-l border-edge bg-panel py-2">
        <button className="btn px-1.5" onClick={onToggle} title="Show analysis">
          «
        </button>
        <div className="mt-4 font-pixel text-lg tracking-widest text-slate-500 [writing-mode:vertical-rl]">ANALYSIS</div>
      </aside>
    );
  }

  const comp = selection?.type === 'component' ? circuit.components.find((c) => c.id === selection.id) : undefined;
  let table: TruthTableView | null = null;
  let live: string | null = null;
  if (comp?.kind === 'ff') {
    const level = (pin: string) => sim.pinState(comp.id, pin)?.level;
    const lowAct = comp.asyncActiveLow ?? true;
    const act = (pin: string) => {
      const l = level(pin);
      return lowAct ? l === 'L' : l === 'H';
    };
    const [a, b] = ffDataPins(comp.ffType ?? 'D');
    table = ffTruthTable(comp, { pre: act('PRE'), clr: act('CLR'), a: level(a) === 'H', b: b ? level(b) === 'H' : false });
    const st = sim.ffState(comp.id);
    live = `Q = ${st?.q ? 1 : 0} · Q̄ = ${st?.qn ? 1 : 0}`;
  } else if (comp?.kind === 'gate') {
    const n = gateInputCount(comp);
    const ins = Array.from({ length: n }, (_, i) => sim.pinState(comp.id, `I${i}`)?.level === 'H');
    table = gateTruthTable(comp, ins);
    live = `OUT = ${sim.gateOut(comp.id) ? 1 : 0}`;
  }

  const counterIds = sim.compiled.counterFFs;
  const bits = counterIds.length;
  const value = sim.counterValue();
  const cycle = bits ? sim.tracker.cycle() : null;

  return (
    <aside className="scroll-thin flex w-80 shrink-0 flex-col overflow-y-auto border-l border-edge bg-panel">
      <div className="flex items-center justify-between border-b border-edge px-3 py-2">
        <span className="font-pixel text-xl tracking-widest text-glow-cyan">ANALYSIS</span>
        <button className="btn px-1.5" onClick={onToggle} title="Collapse">
          »
        </button>
      </div>

      <section className="border-b border-edge p-3">
        <h3 className="mb-2 font-pixel text-lg tracking-widest text-slate-300">TRUTH TABLE</h3>
        {table ? (
          <TruthTable view={table} live={live} />
        ) : (
          <p className="text-[11px] text-slate-500">Select a flip-flop or a gate on the canvas to see its live truth table.</p>
        )}
      </section>

      <section className="p-3">
        <h3 className="mb-1 font-pixel text-lg tracking-widest text-slate-300">STATE TRANSITION DIAGRAM</h3>
        <p className="mb-2 text-[10px] text-slate-500">sơ đồ chuyển đổi trạng thái · auto-tracked</p>
        {!bits || !cycle ? (
          <p className="text-[11px] text-slate-500">
            Label flip-flops <b className="text-slate-300">FF0, FF1, FF2…</b> (FF0 = LSB) and run the clock to track counter states.
          </p>
        ) : (
          <CounterView cycle={cycle} bits={bits} value={value} names={counterIds.map((id) => circuitLabel(circuit.components, id))} onReset={() => sim.tracker.reset()} />
        )}
      </section>
    </aside>
  );
}

function circuitLabel(cs: CircuitComponent[], id: string) {
  return cs.find((c) => c.id === id)?.label ?? '?';
}

function TruthTable({ view, live }: { view: TruthTableView; live: string | null }) {
  return (
    <div>
      <div className="mb-1 text-[11px] text-glow-amber">{view.title}</div>
      {live && <div className="mb-2 font-pixel text-lg text-white">{live}</div>}
      <table className="w-full border-collapse text-center font-mono text-[11px]">
        <thead>
          <tr className="text-glow-cyan">
            {view.headers.map((h, i) => (
              <th key={i} className={`border border-edge px-1 py-0.5 ${i === view.headers.length - 1 ? 'text-glow-amber' : ''}`}>
                {h}
              </th>
            ))}
            {view.rows.some((r) => r.note) && <th className="border border-edge px-1 py-0.5 text-slate-500">mode</th>}
          </tr>
        </thead>
        <tbody>
          {view.rows.map((r, i) => (
            <tr key={i} className={r.match ? 'bg-[#2a2410] text-glow-amber' : 'text-slate-300'}>
              {r.cells.map((c, j) => (
                <td key={j} className="border border-edge px-1 py-0.5">
                  {c}
                </td>
              ))}
              <td className="border border-edge px-1 py-0.5 font-bold">{r.next}</td>
              {r.note && <td className="border border-edge px-1 py-0.5 text-[10px] text-slate-500">{r.note}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {view.footnote && <p className="mt-1 text-[10px] text-slate-500">{view.footnote}</p>}
    </div>
  );
}

function CounterView({
  cycle,
  bits,
  value,
  names,
  onReset,
}: {
  cycle: CycleInfo;
  bits: number;
  value: number | null;
  names: string[];
  onReset: () => void;
}) {
  const header = names.map((_, i) => `Q${bits - 1 - i}`).join(' ');
  const b = (v: number) => toBits(v, bits);
  const chain: string[] = [];
  cycle.states.forEach((s, i) => {
    chain.push(b(s));
    for (const t of cycle.via[i] ?? []) chain.push(`(${b(t)} tạm)`);
  });
  if (cycle.closed && cycle.states.length) chain.push(b(cycle.states[0]));
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-pixel text-lg text-white">
          {header} = {value === null ? '?' : `${b(value)} (${value})`}
        </span>
        <button className="btn px-1.5 py-0 text-[10px]" onClick={onReset}>
          reset
        </button>
      </div>
      <div className="mb-2 flex gap-2">
        <span className="rounded border border-glow-amber/60 bg-[#2a2410] px-2 py-0.5 font-pixel text-lg text-glow-amber">
          MOD {cycle.mod ?? '?'}
        </span>
        {cycle.direction && (
          <span className="rounded border border-glow-cyan/60 bg-[#0d2a30] px-2 py-0.5 font-pixel text-lg text-glow-cyan">
            {cycle.direction === 'UP' ? 'COUNT UP ▲' : cycle.direction === 'DOWN' ? 'COUNT DOWN ▼' : 'MIXED'}
          </span>
        )}
      </div>
      <StateDiagram cycle={cycle} bits={bits} value={value} />
      <p className="mt-2 font-mono text-[11px] leading-relaxed text-slate-300">
        {chain.map((s, i) => (
          <span key={i}>
            {i > 0 && <span className="text-slate-500"> → </span>}
            <span className={s.includes('tạm') ? 'text-glow-red' : ''}>{s}</span>
          </span>
        ))}
        {!cycle.closed && <span className="text-slate-500"> … (waiting for the cycle to close)</span>}
      </p>
    </div>
  );
}

function StateDiagram({ cycle, bits, value }: { cycle: CycleInfo; bits: number; value: number | null }) {
  const W = 280;
  const H = 230;
  const cx = W / 2;
  const cy = H / 2;
  const n = cycle.states.length;
  if (!n) return <p className="text-[11px] text-slate-500">Waiting for clock edges…</p>;
  const R = Math.min(88, 30 + n * 9);
  const nodeR = bits > 3 ? 19 : 16;
  const pos = (i: number) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a };
  };
  const arrows: JSX.Element[] = [];
  const temps: JSX.Element[] = [];
  const count = cycle.closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const p = pos(i);
    const q = pos((i + 1) % n);
    const via = cycle.via[i] ?? [];
    // shorten line to node borders
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L;
    const uy = dy / L;
    if (via.length) {
      // route through an outer temporary node
      const ma = (p.a + (i + 1 === n ? p.a + Math.PI * 2 / n : q.a)) / 2;
      const mid = { x: cx + (R + 34) * Math.cos(ma), y: cy + (R + 34) * Math.sin(ma) };
      const seg = (a: { x: number; y: number }, bb: { x: number; y: number }, ra: number, rb: number, key: string) => {
        const ddx = bb.x - a.x;
        const ddy = bb.y - a.y;
        const LL = Math.hypot(ddx, ddy) || 1;
        return (
          <line
            key={key}
            x1={a.x + (ddx / LL) * ra}
            y1={a.y + (ddy / LL) * ra}
            x2={bb.x - (ddx / LL) * (rb + 2)}
            y2={bb.y - (ddy / LL) * (rb + 2)}
            stroke="#ff4d5e"
            strokeDasharray="3 3"
            strokeWidth={1.5}
            markerEnd="url(#arrRed)"
          />
        );
      };
      arrows.push(seg(p, mid, nodeR, 15, `a${i}`), seg(mid, q, 15, nodeR, `b${i}`));
      temps.push(
        <g key={`t${i}`}>
          <circle cx={mid.x} cy={mid.y} r={15} fill="#2a0f16" stroke="#ff4d5e" strokeDasharray="3 2" />
          <text x={mid.x} y={mid.y + 1} fill="#ff8a96" fontSize={10} textAnchor="middle" dominantBaseline="middle" fontFamily="JetBrains Mono, monospace">
            {toBits(via[0], bits)}
          </text>
          <text x={mid.x} y={mid.y + 23} fill="#ff4d5e" fontSize={9} textAnchor="middle" fontFamily="JetBrains Mono, monospace">
            tạm
          </text>
        </g>,
      );
    } else {
      arrows.push(
        <line
          key={`a${i}`}
          x1={p.x + ux * nodeR}
          y1={p.y + uy * nodeR}
          x2={q.x - ux * (nodeR + 2)}
          y2={q.y - uy * (nodeR + 2)}
          stroke="#4de8ff"
          strokeWidth={1.5}
          markerEnd="url(#arr)"
        />,
      );
    }
  }
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="rounded border border-edge bg-[#0b0e1c]">
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#4de8ff" />
        </marker>
        <marker id="arrRed" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#ff4d5e" />
        </marker>
      </defs>
      {arrows}
      {temps}
      {cycle.states.map((s, i) => {
        const p = pos(i);
        const cur = s === value;
        return (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={nodeR}
              fill={cur ? '#2a2410' : '#12162a'}
              stroke={cur ? '#ffc94a' : '#4a5488'}
              strokeWidth={cur ? 2 : 1.2}
              style={cur ? { filter: 'drop-shadow(0 0 4px #ffc94a)' } : undefined}
            />
            <text
              x={p.x}
              y={p.y + 1}
              fill={cur ? '#ffc94a' : '#c9d1ff'}
              fontSize={bits > 3 ? 9 : 11}
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily="JetBrains Mono, monospace"
            >
              {toBits(s, bits)}
            </text>
          </g>
        );
      })}
      {cycle.mod && (
        <text x={cx} y={cy + 4} fill="#ffc94a" fontSize={18} textAnchor="middle" fontFamily="VT323, monospace">
          MOD {cycle.mod}
        </text>
      )}
    </svg>
  );
}
