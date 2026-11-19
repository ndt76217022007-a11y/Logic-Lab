// Ideal (zero-delay) timing-diagram engine for the drawing exercises.
// Time is split into slots. Boundary i sits between slot i-1 and slot i.
// A clock edge happens on boundary i when CLK[i-1] != CLK[i].
// Inputs used at an edge are the values in slot i-1 (just before the edge).
import type { ClockEdge, FFType } from '../types/circuit';
import { ffNext } from '../engine/simulator';

export type Bits = number[];

/** Square clock: `half` slots low, `half` slots high, starting low. */
export function clockBits(slots: number, half = 2, startHigh = false): Bits {
  return Array.from({ length: slots }, (_, i) => (Math.floor(i / half) % 2 === 0 ? (startHigh ? 1 : 0) : startHigh ? 0 : 1));
}

/** Boundaries of active edges of a clock track. */
export function activeEdges(clk: Bits, edge: ClockEdge): number[] {
  const out: number[] = [];
  for (let i = 1; i < clk.length; i++) {
    if (clk[i - 1] === clk[i]) continue;
    if ((edge === 'rising' && clk[i] === 1) || (edge === 'falling' && clk[i] === 0)) out.push(i);
  }
  return out;
}

/**
 * Data track holding `values[k]` around the k-th active edge. Values change on
 * the boundary right after the previous edge (+1), never on a clock edge.
 */
export function perEdge(values: number[], edges: number[], slots: number): Bits {
  return Array.from({ length: slots }, (_, i) => {
    const k = edges.findIndex((e) => e >= i);
    return values[k === -1 ? values.length - 1 : Math.min(k, values.length - 1)] ?? 0;
  });
}

/** Constant track with pulses set to `level` on [from, to] slot ranges (inclusive). */
export function pulses(slots: number, idle: number, ranges: [number, number][], level = 1 - idle): Bits {
  const b = Array.from({ length: slots }, () => idle);
  for (const [a, z] of ranges) for (let i = a; i <= z && i < slots; i++) b[i] = level;
  return b;
}

// ------------------------------------------------------------------ single flip-flop
export interface FFWaveSpec {
  ff: FFType;
  edge: ClockEdge;
  asyncActiveLow: boolean;
  initQ: 0 | 1;
  clk: Bits;
  /** S/J/D/T */
  a: Bits;
  /** R/K */
  b?: Bits;
  pre?: Bits;
  clr?: Bits;
}

export interface WaveEvent {
  slot: number; // boundary index
  kind: 'edge' | 'pre' | 'clr' | 'release' | 'both';
  text: string;
  q: number;
}

const PIN = { SR: ['S', 'R'], JK: ['J', 'K'], D: ['D', ''], T: ['T', ''] } as const;

function syncMeaning(ff: FFType, a: number, b: number): string {
  switch (ff) {
    case 'D':
      return a ? 'Set (Q = D = 1)' : 'Reset (Q = D = 0)';
    case 'T':
      return a ? 'Đảo trạng thái' : 'Giữ nguyên';
    case 'JK':
      return a && b ? 'Đảo trạng thái' : a ? 'Set' : b ? 'Reset' : 'Giữ nguyên';
    case 'SR':
      return a && b ? 'Cấm (không dùng)' : a ? 'Set' : b ? 'Reset' : 'Giữ nguyên';
  }
}

export function simulateFFWave(spec: FFWaveSpec): { q: Bits; events: WaveEvent[]; edges: number[] } {
  const n = spec.clk.length;
  const q: Bits = new Array(n).fill(0);
  const events: WaveEvent[] = [];
  const edges = activeEdges(spec.clk, spec.edge);
  const act = (track: Bits | undefined, i: number) => !!track && (spec.asyncActiveLow ? track[i] === 0 : track[i] === 1);
  const preName = spec.asyncActiveLow ? 'PRĒ' : 'PRE';
  const clrName = spec.asyncActiveLow ? 'CLR̄' : 'CLR';
  const lvl = spec.asyncActiveLow ? 0 : 1;
  let cur = spec.initQ;
  const [na, nb] = PIN[spec.ff];
  for (let i = 0; i < n; i++) {
    const pre = act(spec.pre, i);
    const clr = act(spec.clr, i);
    const prevPre = i > 0 && act(spec.pre, i - 1);
    const prevClr = i > 0 && act(spec.clr, i - 1);
    if (pre && clr) {
      cur = 1;
      if (!(prevPre && prevClr)) events.push({ slot: i, kind: 'both', text: `${preName} và ${clrName} cùng tích cực → trạng thái CẤM`, q: 1 });
    } else if (pre) {
      cur = 1;
      if (!prevPre) events.push({ slot: i, kind: 'pre', text: `${preName} = ${lvl} → Preset NGAY (bất chấp CLK) → Q = 1`, q: 1 });
    } else if (clr) {
      cur = 0;
      if (!prevClr) events.push({ slot: i, kind: 'clr', text: `${clrName} = ${lvl} → Clear NGAY (bất chấp CLK) → Q = 0`, q: 0 });
    } else {
      if (prevPre || prevClr) {
        events.push({ slot: i, kind: 'release', text: `${prevPre ? preName : clrName} hết tích cực → Q giữ = ${cur} tới cạnh kế tiếp`, q: cur });
      }
      if (i > 0 && edges.includes(i)) {
        const a = spec.a[i - 1];
        const b = spec.b ? spec.b[i - 1] : 0;
        const [nq] = ffNext(spec.ff, !!a, !!b, !!cur);
        const next = spec.ff === 'SR' && a && b ? cur : nq ? 1 : 0;
        const ins = nb ? `${na}=${a}, ${nb}=${b}` : `${na}=${a}`;
        events.push({ slot: i, kind: 'edge', text: `${spec.edge === 'rising' ? '↑' : '↓'} CLK: ${ins} → ${syncMeaning(spec.ff, a, b)} → Q = ${next}`, q: next });
        cur = next;
      }
    }
    q[i] = cur;
  }
  return { q, events, edges };
}

// ------------------------------------------------------------------ counters
export interface CounterWaveSpec {
  bits: number;
  slots: number;
  half: number;
  /** Edge that clocks FF0 (and, for sync counters, every FF). */
  edge: ClockEdge;
  init: number;
  /** Next state function (stable sequence). */
  next: (s: number) => number;
  /** Temporary state immediately forced to `resetTo` (async MOD < 2^n). */
  temp?: number;
  resetTo?: number;
  sync?: boolean;
}

export interface Spike {
  slot: number; // boundary
  track: number; // bit index
  level: number; // 1 = narrow HIGH spike, 0 = narrow LOW dip
}

export function simulateCounterWave(spec: CounterWaveSpec) {
  const clk = clockBits(spec.slots, spec.half);
  const edges = activeEdges(clk, spec.edge);
  const states: number[] = new Array(spec.slots).fill(spec.init);
  const spikes: Spike[] = [];
  const events: WaveEvent[] = [];
  const fmt = (v: number) => v.toString(2).padStart(spec.bits, '0');
  let cur = spec.init;
  for (let i = 0; i < spec.slots; i++) {
    if (edges.includes(i)) {
      let nx = spec.next(cur);
      if (spec.temp !== undefined && nx === spec.temp) {
        const rt = spec.resetTo ?? 0;
        for (let b = 0; b < spec.bits; b++) {
          const tb = (nx >> b) & 1;
          if (tb !== ((cur >> b) & 1) && tb !== ((rt >> b) & 1)) spikes.push({ slot: i, track: b, level: tb });
        }
        events.push({ slot: i, kind: 'edge', text: `${fmt(cur)} → (${fmt(nx)} tạm) → về ${fmt(rt)} ngay`, q: rt });
        nx = rt;
      } else events.push({ slot: i, kind: 'edge', text: `${fmt(cur)} → ${fmt(nx)}`, q: nx });
      cur = nx;
    }
    states[i] = cur;
  }
  const tracks = Array.from({ length: spec.bits }, (_, b) => states.map((s) => (s >> b) & 1));
  return { clk, edges, states, tracks, spikes, events };
}

export const upNext = (bits: number) => (s: number) => (s + 1) % (1 << bits);
export const downNext = (bits: number) => (s: number) => (s - 1 + (1 << bits)) % (1 << bits);

/** Ordered stable cycle starting from `start`. */
export function cycleOf(start: number, next: (s: number) => number, temp?: number, resetTo?: number): number[] {
  const out: number[] = [];
  let s = start;
  for (let i = 0; i < 64 && !out.includes(s); i++) {
    out.push(s);
    let nx = next(s);
    if (temp !== undefined && nx === temp) nx = resetTo ?? 0;
    s = nx;
  }
  return out;
}

// ------------------------------------------------------------------ excitation helpers
export function excite(ff: FFType, q: number, qn: number): string[] {
  switch (ff) {
    case 'JK':
      return q === 0 ? [String(qn), 'X'] : ['X', String(1 - qn)];
    case 'SR':
      if (q === 0) return qn ? ['1', '0'] : ['0', 'X'];
      return qn ? ['X', '0'] : ['0', '1'];
    case 'D':
      return [String(qn)];
    case 'T':
      return [String(q ^ qn)];
  }
}
