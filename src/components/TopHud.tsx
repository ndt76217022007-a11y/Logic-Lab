import { useRef } from 'react';
import SevenSegment from './SevenSegment';
import type { PresetDef } from '../lessons/sequentialPresets';

interface Props {
  transistors: number;
  circuitName: string;
  onRename: (name: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onClear: () => void;
  ticksPerSecond: number;
  onTicksPerSecond: (n: number) => void;
  // clock
  hasClock: boolean;
  clockRunning: boolean;
  onToggleClock: () => void;
  onStepEdge: () => void;
  onReset: () => void;
  // presets
  presets: PresetDef[];
  onLoadPreset: (id: string) => void;
  // docked panels
  dock: 'none' | 'ref' | 'help' | 'ex';
  onDock: (d: 'ref' | 'help' | 'ex') => void;
}

export default function TopHud(p: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-edge bg-panel px-4 py-2">
      <div className="flex flex-col leading-none">
        <div className="flex items-baseline gap-2">
          <span className="font-pixel text-3xl tracking-widest text-glow-cyan drop-shadow-[0_0_6px_rgba(77,232,255,0.6)]">LOGIC</span>
          <span className="font-pixel text-3xl tracking-widest text-glow-amber">LAB</span>
        </div>
        <span className="text-[9px] tracking-widest text-slate-500">SEQUENTIAL LOGIC · TIMING DIAGRAMS</span>
      </div>

      <div className="flex items-center gap-3 rounded border border-[#3a3320] bg-[#07080f] px-3 py-1.5">
        <SevenSegment value={p.transistors} digits={6} height={30} />
        <div className="leading-tight">
          <div className="font-pixel text-xl tracking-[0.2em] text-white">TRANSISTORS</div>
          <input
            value={p.circuitName}
            onChange={(e) => p.onRename(e.target.value.toUpperCase())}
            className="w-52 bg-transparent font-pixel text-lg tracking-widest text-slate-400 outline-none focus:text-glow-amber"
            aria-label="Circuit name"
          />
        </div>
      </div>

      <div className="flex items-center gap-1.5 rounded border border-edge bg-[#0b0e1c] px-2 py-1">
        <span className="font-pixel text-base tracking-widest text-glow-cyan">CLK</span>
        <button className={`btn ${p.clockRunning ? 'btn-on' : ''}`} onClick={p.onToggleClock} disabled={!p.hasClock} title="Play / pause every clock generator">
          {p.clockRunning ? '❚❚ Pause' : '▶ Play'}
        </button>
        <button className="btn" onClick={p.onStepEdge} disabled={!p.hasClock} title="Toggle the clock once (one edge) and let the circuit settle">
          Step +1 Clock Edge
        </button>
        <button className="btn" onClick={p.onReset} title="Power-on reset: initial Q states, clear the timing diagram">
          ⟲ Reset
        </button>
      </div>

      <select
        className="rounded border border-edge bg-[#1c2140] px-2 py-1 font-mono text-xs text-slate-200"
        value=""
        onChange={(e) => e.target.value && p.onLoadPreset(e.target.value)}
      >
        <option value="">Load Example…</option>
        {[...new Set(p.presets.map((pr) => pr.group))].map((g) => (
          <optgroup key={g} label={g}>
            {p.presets
              .filter((pr) => pr.group === g)
              .map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.title}
                </option>
              ))}
          </optgroup>
        ))}
      </select>

      <div className="flex items-center gap-1.5">
        <button className={`btn ${p.dock === 'help' ? 'btn-on' : ''}`} onClick={() => p.onDock('help')} title="Hướng dẫn sử dụng (F1)">
          ? Hướng dẫn
        </button>
        <button
          className={`btn border-glow-cyan/60 text-glow-cyan ${p.dock === 'ref' ? 'btn-on' : ''}`}
          onClick={() => p.onDock('ref')}
          title="Tra bảng công thức: cổng logic, flip-flop, bảng kích, bộ đếm (B)"
        >
          📖 Tra bảng
        </button>
        <button
          className={`btn border-glow-amber/60 text-glow-amber ${p.dock === 'ex' ? 'btn-on' : ''}`}
          onClick={() => p.onDock('ex')}
          title="Bài tập thực hành, vẽ giản đồ xung, đáp án (E)"
        >
          📝 Bài tập
        </button>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[11px] text-slate-400" title="Simulation speed (ticks per real second). 100 = real time.">
          SPEED
          <input
            type="range"
            min={10}
            max={300}
            step={10}
            value={p.ticksPerSecond}
            onChange={(e) => p.onTicksPerSecond(+e.target.value)}
            className="w-20 accent-[#ffc94a]"
          />
          <span className="w-10 tabular-nums">{(p.ticksPerSecond / 100).toFixed(1)}×</span>
        </label>
        <button className="btn" onClick={p.onUndo} disabled={!p.canUndo} title="Undo (Ctrl+Z)">
          ↶
        </button>
        <button className="btn" onClick={p.onRedo} disabled={!p.canRedo} title="Redo (Ctrl+Y)">
          ↷
        </button>
        <button className="btn" onClick={p.onClear}>
          Clear
        </button>
        <button className="btn" onClick={p.onExport}>
          Export .json
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Import .json
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) p.onImport(f);
            e.target.value = '';
          }}
        />
      </div>
    </header>
  );
}
