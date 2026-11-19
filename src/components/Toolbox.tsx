import { useState, type ReactNode } from 'react';
import type { CircuitComponent, ComponentKind, GateType } from '../types/circuit';
import { KIND_INFO, gateExpression } from '../engine/componentDefs';
import type { Tool } from './CircuitCanvas';

interface Item {
  name: string;
  kind: ComponentKind;
  glyph: string;
  key?: string;
  preset?: Partial<CircuitComponent>;
  hint: string;
}

const P = (name: string, kind: ComponentKind, glyph: string, key?: string): Item => ({ name, kind, glyph, key, hint: KIND_INFO[kind].hint });

const ELECTRONIC: Item[] = [
  P('Nguồn VCC', 'vcc', '⊤', '1'),
  P('Mát GND', 'gnd', '⏚', '2'),
  P('Công tắc', 'switch', '⊶', '3'),
  P('Điện trở', 'resistor', '⌇', '4'),
  P('Tụ điện', 'capacitor', '⊣⊢'),
  P('Cuộn cảm', 'inductor', '∿'),
  P('Diode', 'diode', '▷|'),
  P('NPN', 'npn', '◉', '5'),
  P('PNP', 'pnp', '◎'),
  P('LED', 'led', '●', '6'),
  P('Đầu dò', 'probe', '⌖'),
  P('Hiển thị', 'readout', '▤', '7'),
];

const g = (gateType: GateType, glyph: string): Item => ({
  name: gateType,
  kind: 'gate',
  glyph,
  preset: { gateType, inputs: gateType === 'NOT' ? 1 : 2 },
  hint: `${gateType} · ${gateExpression(gateType, gateType === 'NOT' ? 1 : 2).text}${gateType === 'NOT' ? '' : ' · 2/3/4 chân vào trong Inspector'}`,
});
const GATES: Item[] = [g('NOT', '▷'), g('AND', '◗'), g('OR', '⊃'), g('NAND', '◗'), g('NOR', '⊃'), g('XOR', '⊕'), g('XNOR', '⊙')];

const f = (t: 'SR' | 'JK' | 'D' | 'T'): Item => ({
  name: `${t}-FF`,
  kind: 'ff',
  glyph: '▣',
  preset: { ffType: t },
  hint: `${t} flip-flop (cạnh kích, cực tính PRE/CLR, Q ban đầu chỉnh trong Inspector)`,
});
const SEQ: Item[] = [{ name: 'Xung CLK', kind: 'clock', glyph: '⎍', key: '8', hint: KIND_INFO.clock.hint }, f('SR'), f('JK'), f('D'), f('T')];

export const PLACE_KEYS: Record<string, Tool> = Object.fromEntries(
  [...ELECTRONIC, ...SEQ].filter((i) => i.key).map((i) => [i.key!, { mode: 'place', kind: i.kind, preset: i.preset, name: i.name } as Tool]),
);

type SectionId = 'tools' | 'elec' | 'gates' | 'seq';
const STORE = 'logic-lab:toolbox-open';
function loadOpen(): Record<SectionId, boolean> {
  const def = { tools: true, elec: true, gates: true, seq: true };
  try {
    return { ...def, ...(JSON.parse(localStorage.getItem(STORE) ?? '{}') as Partial<Record<SectionId, boolean>>) };
  } catch {
    return def;
  }
}

interface Props {
  tool: Tool;
  onTool: (t: Tool) => void;
}

export default function Toolbox({ tool, onTool }: Props) {
  const [open, setOpen] = useState(loadOpen);
  const toggle = (s: SectionId) =>
    setOpen((o) => {
      const next = { ...o, [s]: !o[s] };
      try {
        localStorage.setItem(STORE, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

  const btn = (active: boolean, onClick: () => void, glyph: string, label: string, title: string) => (
    <button
      key={label}
      onClick={onClick}
      title={title}
      className={`flex min-w-0 items-center gap-1.5 rounded border px-1.5 py-[3px] text-left font-mono text-[10.5px] ${
        active ? 'border-glow-amber bg-[#2a2410] text-glow-amber' : 'border-edge bg-[#12162a]/90 text-slate-300 hover:border-[#4a5488]'
      }`}
    >
      <span className="w-4 shrink-0 text-center text-[10px]">{glyph}</span>
      <span className="truncate">{label}</span>
    </button>
  );

  const section = (id: SectionId, title: string, count: number, body: ReactNode) => (
    <div className="border-b border-edge/60 last:border-b-0">
      <button
        onClick={() => toggle(id)}
        className="flex w-full items-center justify-between px-1 py-1 font-pixel text-sm tracking-widest text-slate-400 hover:text-slate-200"
        aria-expanded={open[id]}
      >
        <span>
          {open[id] ? '▾' : '▸'} {title}
        </span>
        <span className="text-[10px] text-slate-600">{count}</span>
      </button>
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open[id] ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="grid grid-cols-2 gap-1 px-0.5 pb-2">{body}</div>
        </div>
      </div>
    </div>
  );

  const items = (list: Item[]) =>
    list.map((i) =>
      btn(
        tool.mode === 'place' && (tool.name ?? tool.kind) === i.name,
        () => onTool({ mode: 'place', kind: i.kind, preset: i.preset, name: i.name }),
        i.glyph,
        i.name,
        `${i.name} — ${i.hint}${i.key ? ` (phím ${i.key})` : ''}`,
      ),
    );

  return (
    <div className="scroll-thin absolute left-3 top-3 z-10 flex max-h-[calc(100%-24px)] w-56 flex-col overflow-y-auto overscroll-contain scroll-smooth rounded border border-edge bg-panel/90 p-1.5 shadow-xl backdrop-blur">
      {section(
        'tools',
        'TOOLS',
        2,
        <>
          {btn(tool.mode === 'select', () => onTool({ mode: 'select' }), '↖', 'Chọn', 'Chọn / di chuyển / bấm công tắc (phím V)')}
          {btn(tool.mode === 'wire', () => onTool({ mode: 'wire' }), '└', 'Nối dây', 'Bấm từng điểm gập để vẽ dây vuông góc (phím W)')}
        </>,
      )}
      {section('elec', 'LINH KIỆN ĐIỆN TỬ', ELECTRONIC.length, items(ELECTRONIC))}
      {section('gates', 'CỔNG LOGIC', GATES.length, items(GATES))}
      {section('seq', 'MẠCH TUẦN TỰ', SEQ.length, items(SEQ))}
    </div>
  );
}
