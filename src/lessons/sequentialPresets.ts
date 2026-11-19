// Coursework presets: latches, flip-flops, asynchronous and synchronous counters.
//
// Grid conventions (rot 0):
//   Flip-flop at (x,y): D/J/S (x-3,y-2) · CLK (x-3,y) · K/R (x-3,y+2)
//                       Q (x+3,y-2) · Q̄ (x+3,y+2) · PRE (x,y-4) · CLR (x,y+4)
//   Gate at (x,y): inputs (x-2, y-1 / y / y+1) · OUT (x+3,y)
//   Clock at (x,y): out (x+2,y) · Switch: out (x+1,y) · LED: in (x-1,y) · VCC: pin (x,y)
// Wire endpoints connect to pins / other wires at the same point or on a segment;
// crossings in the middle of two segments do NOT connect.
import type { Circuit, CircuitComponent, ClockEdge, ComponentKind, FFType, GateType, Point, Probe, Wire } from '../types/circuit';
import { NAND_EXAMPLE } from './starterLessons';

let n = 0;
const id = (p: string) => `${p}_${(++n).toString(36)}_${Date.now().toString(36)}`;
const C = (kind: ComponentKind, x: number, y: number, extra: Partial<CircuitComponent> = {}): CircuitComponent => ({
  id: id(kind),
  kind,
  x,
  y,
  rot: 0,
  ...extra,
});
const W = (...pts: [number, number][]): Wire => ({ id: id('w'), points: pts.map(([x, y]): Point => ({ x, y })) });
const P = (label: string, comp: CircuitComponent, pinId: string): Probe => ({
  id: id('p'),
  label,
  target: { type: 'pin', componentId: comp.id, pinId },
});

// ------------------------------------------------------------------ latches
function latch(kind: 'NAND' | 'NOR'): Circuit {
  // NAND: top input S̄ → Q, bottom R̄ → Q̄ (active-LOW).
  // NOR:  top input R → Q, bottom S → Q̄ (active-HIGH).
  const nand = kind === 'NAND';
  const top = C('switch', 8, 5, nand ? { label: 'S̄', on: false } : { label: 'R', on: false });
  const bot = C('switch', 8, 15, nand ? { label: 'R̄', on: true } : { label: 'S', on: true });
  const g1 = C('gate', 14, 6, { gateType: kind, inputs: 2, label: 'U1' });
  const g2 = C('gate', 14, 14, { gateType: kind, inputs: 2, label: 'U2' });
  const lq = C('led', 24, 6, { label: 'Q' });
  const lqn = C('led', 24, 14, { label: 'Q̄' });
  return {
    name: nand ? 'SR LATCH (NAND)' : 'SR LATCH (NOR)',
    components: [top, bot, g1, g2, lq, lqn],
    wires: [
      W([9, 5], [12, 5]),
      W([9, 15], [12, 15]),
      W([17, 6], [19, 6], [19, 9], [11, 9], [11, 13], [12, 13]), // Q → U2
      W([17, 14], [20, 14], [20, 11], [10, 11], [10, 7], [12, 7]), // Q̄ → U1
      W([19, 6], [23, 6]),
      W([20, 14], [23, 14]),
    ],
    probes: nand
      ? [P('S̄', top, 'out'), P('R̄', bot, 'out'), P('Q', g1, 'OUT'), P('Q̄', g2, 'OUT')]
      : [P('S', bot, 'out'), P('R', top, 'out'), P('Q', g1, 'OUT'), P('Q̄', g2, 'OUT')],
  };
}

// ------------------------------------------------------------------ JK playground
function jkPlayground(): Circuit {
  const ff = C('ff', 20, 10, { ffType: 'JK', edge: 'falling', asyncActiveLow: true, initQ: 0, label: 'FF0' });
  const sJ = C('switch', 12, 6, { label: 'J', on: true });
  const clk = C('clock', 12, 10, { label: 'CLK', freq: 1 });
  const sK = C('switch', 12, 14, { label: 'K', on: true });
  const sPre = C('switch', 16, 3, { label: 'PRĒ', on: true });
  const sClr = C('switch', 16, 17, { label: 'CLR̄', on: true });
  const lq = C('led', 27, 8, { label: 'Q' });
  const lqn = C('led', 27, 12, { label: 'Q̄' });
  return {
    name: 'JK FLIP-FLOP PLAYGROUND',
    components: [ff, sJ, clk, sK, sPre, sClr, lq, lqn],
    wires: [
      W([13, 6], [15, 6], [15, 8], [17, 8]),
      W([14, 10], [17, 10]),
      W([13, 14], [15, 14], [15, 12], [17, 12]),
      W([17, 3], [20, 3], [20, 6]),
      W([17, 17], [20, 17], [20, 14]),
      W([23, 8], [26, 8]),
      W([23, 12], [26, 12]),
    ],
    probes: [
      P('CLK', clk, 'out'),
      P('J', sJ, 'out'),
      P('K', sK, 'out'),
      P('PRĒ', sPre, 'out'),
      P('CLR̄', sClr, 'out'),
      P('Q', ff, 'Q'),
      P('Q̄', ff, 'QN'),
    ],
  };
}

// ------------------------------------------------------------------ D-FF → JK-FF conversion: D = Q̄·J + Q·K̄
function dToJk(): Circuit {
  const ff = C('ff', 30, 12, { ffType: 'D', edge: 'rising', asyncActiveLow: true, initQ: 0, label: 'D-FF' });
  const sJ = C('switch', 4, 7, { label: 'J', on: true });
  const sK = C('switch', 4, 16, { label: 'K', on: false });
  const clk = C('clock', 4, 12, { label: 'CLK', freq: 1 });
  const not = C('gate', 10, 16, { gateType: 'NOT', inputs: 1, label: 'K̄' });
  const and1 = C('gate', 18, 6, { gateType: 'AND', inputs: 2, label: 'Q̄·J' });
  const and2 = C('gate', 18, 18, { gateType: 'AND', inputs: 2, label: 'Q·K̄' });
  const or = C('gate', 24, 10, { gateType: 'OR', inputs: 2, label: 'D' });
  const led = C('led', 40, 10, { label: 'Q' });
  return {
    name: 'D-FF → JK-FF',
    components: [ff, sJ, sK, clk, not, and1, and2, or, led],
    wires: [
      W([6, 12], [27, 12]), // CLK
      W([5, 16], [8, 16]), // K → NOT
      W([5, 7], [16, 7]), // J → AND1.B
      W([33, 14], [35, 14], [35, 2], [15, 2], [15, 5], [16, 5]), // Q̄ → AND1.A
      W([13, 16], [14, 16], [14, 19], [16, 19]), // K̄ → AND2.B
      W([33, 10], [36, 10], [36, 22], [15, 22], [15, 17], [16, 17]), // Q → AND2.A
      W([21, 6], [22, 6], [22, 9]), // AND1 → OR
      W([21, 18], [22, 18], [22, 11]), // AND2 → OR
      W([36, 10], [39, 10]), // Q → LED
    ],
    probes: [P('CLK', clk, 'out'), P('J', sJ, 'out'), P('K', sK, 'out'), P('D', or, 'OUT'), P('Q', ff, 'Q')],
  };
}

const FF_X = [14, 24, 34];

// ------------------------------------------------------------------ async MOD-8 with JK (J = K = 1, Q → next CLK)
function asyncJkMod8(edge: ClockEdge): Circuit {
  const clk = C('clock', 6, 10, { label: 'CLK', freq: 2 });
  const vcc = C('vcc', 8, 6);
  const ffs = FF_X.map((x, i) => C('ff', x, 10, { ffType: 'JK', edge, asyncActiveLow: true, initQ: 0, label: `FF${i}` }));
  const leds = FF_X.map((x, i) => C('led', x + 5, 2, { label: `Q${i}` }));
  const wires: Wire[] = [W([8, 10], [11, 10]), W([8, 6], [30, 6])];
  FF_X.forEach((x, i) => {
    wires.push(W([x - 4, 6], [x - 4, 12], [x - 3, 12])); // K = 1
    wires.push(W([x - 4, 8], [x - 3, 8])); // J = 1
    if (i < 2) {
      wires.push(W([x + 3, 8], [x + 5, 8], [x + 5, 10], [x + 7, 10])); // Q → next CLK
      wires.push(W([x + 4, 8], [x + 4, 2]));
    } else wires.push(W([x + 3, 8], [x + 4, 8], [x + 4, 2]));
  });
  const up = edge === 'falling';
  return {
    name: `MOD-8 ASYNC ${up ? 'UP' : 'DOWN'} (JK ${up ? '↓' : '↑'})`,
    components: [clk, vcc, ...ffs, ...leds],
    wires,
    probes: [P('CLK', clk, 'out'), ...ffs.map((f, i) => P(`Q${i}`, f, 'Q'))],
  };
}

// ------------------------------------------------------------------ async D counters with a reset/preset gate
type Sig = 'Q0' | 'Q1' | 'Q2' | 'Q0n' | 'Q1n' | 'Q2n';

/**
 * 3 D-FFs (↑, Q̄ → D). Up: Q̄ → next CLK; down: Q → next CLK.
 * Up counters reset with NAND → CLR̄ (to 000); down counters preset with OR → PRĒ (to 111).
 */
function asyncD(opts: { name: string; up: boolean; resetInputs: Sig[]; label: string }): Circuit {
  const { up, resetInputs } = opts;
  const clk = C('clock', 6, 10, { label: 'CLK', freq: 2 });
  const ffs = FF_X.map((x, i) => C('ff', x, 10, { ffType: 'D', edge: 'rising', asyncActiveLow: true, initQ: up ? 0 : 1, label: `FF${i}` }));
  const wires: Wire[] = [W([8, 10], [11, 10])];
  FF_X.forEach((x, i) => {
    wires.push(W([x + 3, 12], [x + 4, 12], [x + 4, 16], [x - 4, 16], [x - 4, 8], [x - 3, 8])); // Q̄ → D
    if (i < 2) {
      wires.push(
        up
          ? W([x + 4, 12], [x + 5, 12], [x + 5, 10], [x + 7, 10]) // Q̄ → next CLK
          : W([x + 3, 8], [x + 5, 8], [x + 5, 10], [x + 7, 10]), // Q → next CLK
      );
    }
  });
  const gateType: GateType = up ? 'NAND' : 'OR';
  const k = resetInputs.length;
  const gate = C('gate', 44, 3, { gateType, inputs: k, label: opts.label });
  const lines = k === 2 ? [2, 4] : [2, 3, 4];
  const src = (s: Sig): [number, number] => {
    const i = Number(s[1]);
    return s.endsWith('n') ? [FF_X[i] + 4, 12] : [FF_X[i] + 3, 8];
  };
  resetInputs.forEach((s, j) => {
    const [sx, sy] = src(s);
    wires.push(W([sx, sy], [sx, lines[j]], [42, lines[j]]));
  });
  if (up) wires.push(W([47, 3], [48, 3], [48, 18], [14, 18], [14, 14]), W([24, 18], [24, 14]), W([34, 18], [34, 14]));
  else wires.push(W([47, 3], [48, 3], [48, 0], [14, 0], [14, 6]), W([24, 0], [24, 6]), W([34, 0], [34, 6]));
  return {
    name: opts.name,
    components: [clk, ...ffs, gate],
    wires,
    probes: [
      P('CLK', clk, 'out'),
      ...ffs.map((f, i) => P(`Q${i}`, f, 'Q')),
      P(up ? `${opts.label}_OUT (CLR̄)` : `${opts.label}_OUT (PRĒ)`, gate, 'OUT'),
    ],
  };
}

// ------------------------------------------------------------------ synchronous counters
/** An FF input expression: a rail signal, or one gate over rail signals. */
export interface SyncExpr {
  gate?: GateType;
  sigs: ('ONE' | Sig)[];
}

const RAIL_Y: Record<'ONE' | Sig, number> = { ONE: 1, Q0: 2, Q0n: 3, Q1: 4, Q1n: 5, Q2: 6, Q2n: 7 };

/**
 * Synchronous counter: every FF shares the same CLK; J/K (or D/T) come from
 * gates fed by horizontal rails carrying 1, Q0, Q̄0, Q1, Q̄1, Q2, Q̄2.
 */
function syncCounter(opts: {
  name: string;
  ffType: FFType;
  bits: number;
  inputs: { a: SyncExpr; b?: SyncExpr }[]; // per FF (LSB first): J/D/T and K
  initQ?: 0 | 1;
}): Circuit {
  const S = 24;
  const Y = 16;
  const xs = Array.from({ length: opts.bits }, (_, i) => 26 + S * i);
  const right = xs[xs.length - 1] + 8;
  const clk = C('clock', 2, 24, { label: 'CLK', freq: 2 });
  const vcc = C('vcc', 2, 1);
  const ffs = xs.map((x, i) =>
    C('ff', x, Y, { ffType: opts.ffType, edge: 'rising', asyncActiveLow: true, initQ: opts.initQ ?? 0, label: `FF${i}` }),
  );
  const components: CircuitComponent[] = [clk, vcc, ...ffs];
  const wires: Wire[] = [];
  // rails
  const used = new Set<'ONE' | Sig>();
  opts.inputs.forEach((p) => [p.a, p.b].forEach((e) => e?.sigs.forEach((s) => used.add(s))));
  for (const s of used) {
    const y = RAIL_Y[s];
    if (s === 'ONE') wires.push(W([2, 1], [right, 1]));
    else wires.push(W([6, y], [right, y]));
  }
  // FF outputs up to their rails
  xs.forEach((x, i) => {
    const q = `Q${i}` as Sig;
    const qn = `Q${i}n` as Sig;
    if (used.has(q)) wires.push(W([x + 3, Y - 2], [x + 4, Y - 2], [x + 4, RAIL_Y[q]]));
    if (used.has(qn)) wires.push(W([x + 3, Y + 2], [x + 5, Y + 2], [x + 5, RAIL_Y[qn]]));
  });
  // common clock bus
  wires.push(W([4, 24], [xs[xs.length - 1] - 10, 24]));
  xs.forEach((x) => wires.push(W([x - 10, 24], [x - 10, Y], [x - 3, Y])));
  // input logic
  xs.forEach((x, i) => {
    const spec = opts.inputs[i];
    const place = (e: SyncExpr, pinY: number, dropBase: number) => {
      if (!e.gate || e.sigs.length === 1) {
        const s = e.sigs[0];
        const dx = dropBase;
        wires.push(W([dx, RAIL_Y[s]], [dx, pinY], [x - 3, pinY]));
        return;
      }
      const n = e.sigs.length;
      const g = C('gate', x - 7, pinY, { gateType: e.gate, inputs: n });
      components.push(g);
      const ys = n === 2 ? [pinY - 1, pinY + 1] : [pinY - 1, pinY, pinY + 1];
      e.sigs.forEach((s, j) => wires.push(W([dropBase + j, RAIL_Y[s]], [dropBase + j, ys[j]], [x - 9, ys[j]])));
      wires.push(W([x - 4, pinY], [x - 3, pinY]));
    };
    place(spec.a, Y - 2, x - 17);
    if (spec.b) place(spec.b, Y + 2, x - 14);
  });
  return {
    name: opts.name,
    components,
    wires,
    probes: [P('CLK', clk, 'out'), ...ffs.map((f, i) => P(`Q${i}`, f, 'Q'))],
  };
}

const one: SyncExpr = { sigs: ['ONE'] };
const s = (x: Sig): SyncExpr => ({ sigs: [x] });
const and = (...sigs: Sig[]): SyncExpr => ({ gate: 'AND', sigs });

export interface PresetDef {
  id: string;
  title: string;
  group: string;
  build: () => Circuit;
}

export const SEQUENTIAL_PRESETS: PresetDef[] = [
  { id: 'sr', group: 'Flip-Flop', title: 'Chốt SR (2× NAND mắc chéo)', build: () => latch('NAND') },
  { id: 'sr-nor', group: 'Flip-Flop', title: 'Chốt SR (2× NOR mắc chéo)', build: () => latch('NOR') },
  { id: 'jk', group: 'Flip-Flop', title: 'JK Flip-Flop Playground', build: jkPlayground },
  { id: 'd2jk', group: 'Flip-Flop', title: 'Chuyển đổi D-FF → JK-FF (D = Q̄J + QK̄)', build: dToJk },
  { id: 'mod8', group: 'Đếm bất đồng bộ', title: 'Bài 1 · MOD-8 thuận (JK ↓, nối Q)', build: () => asyncJkMod8('falling') },
  { id: 'mod8down', group: 'Đếm bất đồng bộ', title: 'Bài 2 · MOD-8 ngược (JK ↑, nối Q)', build: () => asyncJkMod8('rising') },
  {
    id: 'mod7',
    group: 'Đếm bất đồng bộ',
    title: 'Bài 3 · MOD-7 thuận (D ↑, NAND3 → CLR̄)',
    build: () => asyncD({ name: 'MOD-7 ASYNC UP (D)', up: true, resetInputs: ['Q2', 'Q1', 'Q0'], label: 'NAND' }),
  },
  {
    id: 'mod5',
    group: 'Đếm bất đồng bộ',
    title: 'Bài 4a · MOD-5 thuận (NAND2 Q2,Q0 → CLR̄)',
    build: () => asyncD({ name: 'MOD-5 ASYNC UP (D)', up: true, resetInputs: ['Q2', 'Q0'], label: 'NAND' }),
  },
  {
    id: 'mod6up',
    group: 'Đếm bất đồng bộ',
    title: 'Bài 4b · MOD-6 thuận (NAND2 Q2,Q1 → CLR̄)',
    build: () => asyncD({ name: 'MOD-6 ASYNC UP (D)', up: true, resetInputs: ['Q2', 'Q1'], label: 'NAND' }),
  },
  {
    id: 'mod6',
    group: 'Đếm bất đồng bộ',
    title: 'Bài 5 · MOD-6 ngược (OR2 QA,QB → PRĒ)',
    build: () => asyncD({ name: 'MOD-6 ASYNC DOWN (D)', up: false, resetInputs: ['Q2', 'Q1'], label: 'OR' }),
  },
  {
    id: 'mod5down',
    group: 'Đếm bất đồng bộ',
    title: 'Mở rộng · MOD-5 ngược (OR2 Q2,Q0 → PRĒ)',
    build: () => asyncD({ name: 'MOD-5 ASYNC DOWN (D)', up: false, resetInputs: ['Q2', 'Q0'], label: 'OR' }),
  },
  {
    id: 'sync8up',
    group: 'Đếm đồng bộ',
    title: 'Đồng bộ MOD-8 thuận (JK: 1 · Q0 · Q0Q1)',
    build: () =>
      syncCounter({
        name: 'SYNC MOD-8 UP (JK)',
        ffType: 'JK',
        bits: 3,
        inputs: [
          { a: one, b: one },
          { a: s('Q0'), b: s('Q0') },
          { a: and('Q0', 'Q1'), b: and('Q0', 'Q1') },
        ],
      }),
  },
  {
    id: 'sync8down',
    group: 'Đếm đồng bộ',
    title: 'Đồng bộ MOD-8 ngược (JK: 1 · Q̄0 · Q̄0Q̄1)',
    build: () =>
      syncCounter({
        name: 'SYNC MOD-8 DOWN (JK)',
        ffType: 'JK',
        bits: 3,
        inputs: [
          { a: one, b: one },
          { a: s('Q0n'), b: s('Q0n') },
          { a: and('Q0n', 'Q1n'), b: and('Q0n', 'Q1n') },
        ],
      }),
  },
  {
    id: 'sync6',
    group: 'Đếm đồng bộ',
    title: 'Đồng bộ MOD-6 thuận (JK, thiết kế bằng bảng kích)',
    build: () =>
      syncCounter({
        name: 'SYNC MOD-6 UP (JK)',
        ffType: 'JK',
        bits: 3,
        inputs: [
          { a: one, b: one },
          { a: and('Q0', 'Q2n'), b: s('Q0') },
          { a: and('Q1', 'Q0'), b: s('Q0') },
        ],
      }),
  },
  {
    id: 'sync5',
    group: 'Đếm đồng bộ',
    title: 'Đồng bộ MOD-5 thuận (JK, thiết kế bằng bảng kích)',
    build: () =>
      syncCounter({
        name: 'SYNC MOD-5 UP (JK)',
        ffType: 'JK',
        bits: 3,
        inputs: [
          { a: s('Q2n'), b: one },
          { a: s('Q0'), b: s('Q0') },
          { a: and('Q1', 'Q0'), b: one },
        ],
      }),
  },
  {
    id: 'sync4d',
    group: 'Đếm đồng bộ',
    title: 'Đồng bộ MOD-4 thuận (D: D0 = Q̄0, D1 = Q1⊕Q0)',
    build: () =>
      syncCounter({
        name: 'SYNC MOD-4 UP (D + XOR)',
        ffType: 'D',
        bits: 2,
        inputs: [{ a: s('Q0n') }, { a: { gate: 'XOR', sigs: ['Q1', 'Q0'] } }],
      }),
  },
  { id: 'nand', group: 'Level 1', title: 'Level 1 · 2-Transistor NAND', build: NAND_EXAMPLE },
];

// ------------------------------------------------------------------ starter boards for build exercises
/** Unwired flip-flops (labelled FF0…) + a clock: the student does the wiring. */
export function starterCounter(ffType: FFType, edge: ClockEdge, bits: number, name: string, initQ: 0 | 1 = 0): Circuit {
  const clk = C('clock', 4, 10, { label: 'CLK', freq: 2 });
  const ffs = Array.from({ length: bits }, (_, i) =>
    C('ff', 14 + 12 * i, 10, { ffType, edge, asyncActiveLow: true, initQ, label: `FF${i}` }),
  );
  return { name, components: [clk, ...ffs], wires: [], probes: [P('CLK', clk, 'out'), ...ffs.map((f, i) => P(`Q${i}`, f, 'Q'))] };
}

export function starterLatch(kind: 'NAND' | 'NOR'): Circuit {
  const nand = kind === 'NAND';
  const a = C('switch', 6, 5, nand ? { label: 'S̄', on: true } : { label: 'S', on: false });
  const b = C('switch', 6, 15, nand ? { label: 'R̄', on: true } : { label: 'R', on: false });
  const lq = C('led', 26, 6, { label: 'Q' });
  const lqn = C('led', 26, 14, { label: 'Q̄' });
  return { name: `BÀI TẬP · CHỐT ${kind}`, components: [a, b, lq, lqn], wires: [], probes: [] };
}

export function starterDToJk(): Circuit {
  const ff = C('ff', 30, 12, { ffType: 'D', edge: 'rising', asyncActiveLow: true, initQ: 0, label: 'D-FF' });
  const sJ = C('switch', 4, 7, { label: 'J', on: false });
  const sK = C('switch', 4, 16, { label: 'K', on: false });
  const clk = C('clock', 4, 12, { label: 'CLK', freq: 1 });
  const led = C('led', 40, 10, { label: 'Q' });
  return {
    name: 'BÀI TẬP · D-FF → JK-FF',
    components: [ff, sJ, sK, clk, led],
    wires: [W([6, 12], [27, 12]), W([33, 10], [39, 10])],
    probes: [P('CLK', clk, 'out'), P('J', sJ, 'out'), P('K', sK, 'out'), P('Q', ff, 'Q')],
  };
}
