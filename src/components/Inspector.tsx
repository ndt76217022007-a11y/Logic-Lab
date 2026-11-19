import type { ReactNode } from 'react';
import type { Circuit, CircuitComponent, FFType, GateType, ProbeTarget, Rotation } from '../types/circuit';
import { KIND_INFO, componentTitle, gateExpression, gateInputCount, pinsOf } from '../engine/componentDefs';
import { hasProbe, toggleProbe } from '../engine/probes';
import { displayNames, type Selection } from './CircuitCanvas';

interface Props {
  circuit: Circuit;
  selection: Selection;
  onChange: (next: Circuit, pushHistory: boolean) => void;
  onSelect: (s: Selection) => void;
}

function Seg<T extends string | number>({ value, options, onPick }: { value: T; options: { v: T; label: string }[]; onPick: (v: T) => void }) {
  return (
    <div className="flex overflow-hidden rounded border border-edge">
      {options.map((o) => (
        <button
          key={String(o.v)}
          onClick={() => onPick(o.v)}
          className={`flex-1 px-1.5 py-0.5 text-[11px] ${o.v === value ? 'bg-[#2a2410] text-glow-amber' : 'bg-ink text-slate-400 hover:text-slate-200'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="mb-2">
    <div className="mb-0.5 text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
    {children}
  </div>
);

export default function Inspector({ circuit, selection, onChange, onSelect }: Props) {
  if (!selection) return null;
  const update = (patch: Partial<CircuitComponent>) =>
    onChange({ ...circuit, components: circuit.components.map((c) => (c.id === selection.id ? { ...c, ...patch } : c)) }, true);
  const remove = () => {
    onChange(
      selection.type === 'component'
        ? {
            ...circuit,
            components: circuit.components.filter((c) => c.id !== selection.id),
            probes: (circuit.probes ?? []).filter((p) => !(p.target.type === 'pin' && p.target.componentId === selection.id)),
          }
        : {
            ...circuit,
            wires: circuit.wires.filter((w) => w.id !== selection.id),
            probes: (circuit.probes ?? []).filter((p) => !(p.target.type === 'wire' && p.target.wireId === selection.id)),
          },
      true,
    );
    onSelect(null);
  };

  const comp = selection.type === 'component' ? circuit.components.find((c) => c.id === selection.id) : undefined;
  if (selection.type === 'component' && !comp) return null;
  const labelled = comp && ['switch', 'led', 'readout', 'ff', 'clock', 'gate', 'probe', 'capacitor', 'inductor'].includes(comp.kind);

  const probeBtn = (target: ProbeTarget, name: string) => {
    const on = hasProbe(circuit, target);
    return (
      <button
        key={name}
        onClick={() => onChange(toggleProbe(circuit, target), true)}
        className={`rounded border px-1.5 py-0.5 text-[10.5px] ${on ? 'border-glow-cyan bg-[#0d2a30] text-glow-cyan' : 'border-edge bg-ink text-slate-400 hover:text-slate-200'}`}
        title={on ? 'Remove from timing diagram' : 'Pin to timing diagram'}
      >
        {on ? '✓ ' : '+ '}
        {name}
      </button>
    );
  };

  return (
    <div className="scroll-thin absolute bottom-3 right-3 z-10 max-h-[calc(100%-24px)] w-60 overflow-y-auto rounded border border-edge bg-panel/95 p-3 font-mono text-xs text-slate-300 shadow-xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-pixel text-lg tracking-widest text-glow-cyan">
          {comp ? `${componentTitle(comp)} · ${displayNames(circuit).get(comp.id)}` : 'WIRE'}
        </span>
        <button className="text-slate-500 hover:text-white" onClick={() => onSelect(null)} aria-label="Close">
          ✕
        </button>
      </div>
      {comp && <p className="mb-2 text-[10px] text-slate-500">{KIND_INFO[comp.kind].hint}</p>}

      {labelled && (
        <Row label="Label">
          <input
            value={comp!.label ?? ''}
            maxLength={10}
            onChange={(e) => update({ label: e.target.value.toUpperCase() || undefined })}
            className="w-full rounded border border-edge bg-ink px-1.5 py-0.5 text-glow-amber outline-none focus:border-glow-amber"
          />
          {comp!.kind === 'ff' && <div className="mt-0.5 text-[10px] text-slate-500">Name FF0, FF1, … (FF0 = LSB) to track a counter.</div>}
        </Row>
      )}

      {comp?.kind === 'ff' && (
        <>
          <Row label="Type">
            <Seg<FFType>
              value={comp.ffType ?? 'D'}
              options={(['SR', 'JK', 'D', 'T'] as FFType[]).map((v) => ({ v, label: v }))}
              onPick={(v) => update({ ffType: v })}
            />
          </Row>
          <Row label="Clock trigger">
            <Seg
              value={comp.edge ?? 'rising'}
              options={[
                { v: 'rising', label: '↑ Rising' },
                { v: 'falling', label: '↓ Falling' },
              ]}
              onPick={(v) => update({ edge: v })}
            />
          </Row>
          <Row label="Async PRE / CLR polarity">
            <Seg
              value={(comp.asyncActiveLow ?? true) ? 'low' : 'high'}
              options={[
                { v: 'low', label: 'Active-LOW (PRĒ CLR̄)' },
                { v: 'high', label: 'Active-HIGH' },
              ]}
              onPick={(v) => update({ asyncActiveLow: v === 'low' })}
            />
          </Row>
          <Row label="Initial state">
            <Seg
              value={comp.initQ ?? 0}
              options={[
                { v: 0, label: 'Q = 0' },
                { v: 1, label: 'Q = 1' },
              ]}
              onPick={(v) => update({ initQ: v as 0 | 1 })}
            />
          </Row>
        </>
      )}

      {comp?.kind === 'gate' && (
        <>
          <Row label="Gate">
            <select
              value={comp.gateType ?? 'AND'}
              onChange={(e) => update({ gateType: e.target.value as GateType })}
              className="w-full rounded border border-edge bg-ink px-1 py-0.5"
            >
              {(['NOT', 'AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR'] as GateType[]).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Row>
          {comp.gateType !== 'NOT' && (
            <Row label="Số chân vào (inputs)">
              <Seg
                value={gateInputCount(comp)}
                options={[2, 3, 4].map((v) => ({ v, label: `${v} vào` }))}
                onPick={(v) => update({ inputs: v })}
              />
            </Row>
          )}
          <div
            className="mb-2 rounded border border-edge bg-ink px-2 py-1 font-mono text-[12px] text-glow-amber"
            dangerouslySetInnerHTML={{ __html: gateExpression(comp.gateType ?? 'AND', gateInputCount(comp)).html }}
          />
        </>
      )}

      {comp?.kind === 'clock' && (
        <Row label={`Frequency · ${comp.freq ?? 1} Hz`}>
          <input
            type="range"
            min={0.5}
            max={10}
            step={0.5}
            value={comp.freq ?? 1}
            onChange={(e) => update({ freq: +e.target.value })}
            className="w-full accent-[#ffc94a]"
          />
        </Row>
      )}

      {(comp?.kind === 'capacitor' || comp?.kind === 'inductor') && (
        <Row label={`Hằng số thời gian τ = ${((comp.tau ?? 40) / 100).toFixed(2)} s`}>
          <input
            type="range"
            min={5}
            max={200}
            step={5}
            value={comp.tau ?? 40}
            onChange={(e) => update({ tau: +e.target.value })}
            className="w-full accent-[#4de8ff]"
          />
          <div className="mt-0.5 text-[10px] leading-snug text-slate-500">
            {comp.kind === 'capacitor'
              ? 'Mô hình đơn giản: chân 1 là nút được giữ điện áp, chân 2 coi như nối GND. Nạp qua điện trở theo hàm mũ, ≥ 50% đọc là mức 1. Nối thẳng vào nguồn mạnh thì nạp tức thì.'
              : 'Mô hình đơn giản: dòng chạy chân 1 → chân 2. Chân 2 bám theo chân 1 có quán tính (chống thay đổi đột ngột), ≥ 50% đọc là mức 1.'}
          </div>
        </Row>
      )}

      {comp?.kind === 'readout' && (
        <Row label="Bits">
          <select value={comp.bits ?? 1} onChange={(e) => update({ bits: +e.target.value })} className="rounded border border-edge bg-ink px-1 py-0.5">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </Row>
      )}

      <Row label="Timing diagram">
        <div className="flex flex-wrap gap-1">
          {comp
            ? pinsOf(comp).map((p) => probeBtn({ type: 'pin', componentId: comp.id, pinId: p.id }, p.id === 'QN' ? 'Q̄' : p.label))
            : probeBtn({ type: 'wire', wireId: selection.id }, 'this wire')}
        </div>
      </Row>

      <div className="flex gap-2">
        {comp && (
          <button className="btn" onClick={() => update({ rot: ((comp.rot + 1) % 4) as Rotation })}>
            ⟳ Rotate (R)
          </button>
        )}
        <button className="btn hover:border-glow-red hover:text-glow-red" onClick={remove}>
          Delete
        </button>
      </div>
    </div>
  );
}
