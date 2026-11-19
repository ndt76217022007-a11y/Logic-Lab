// ---------------------------------------------------------------------------
// Mixed switch-level + gate-level simulator with drive strengths.
//
//  * compile(circuit) resolves wires + pins into electrical NETS and lists the
//    active elements (transistors, gates, flip-flops, clocks).
//  * evaluate() merges nets joined by conducting transistors (C–E), applies
//    STRONG drivers (VCC, GND, switches, gate / FF / clock outputs), then lets
//    WEAK values flow through resistors into undriven nets.
//    Result per net: H / L / Z (floating) / X (conflict).
//  * step() advances ONE TICK (= 10 ms of simulated time, TPS = 100):
//    every transistor, gate and flip-flop computes its next output from the
//    current net levels. Outputs change one tick later — this propagation
//    delay is what makes ripple, races and short glitch states (e.g. a MOD-7
//    counter flashing 111 before CLR fires) visible on the timing diagram.
//
// Input conventions: floating data / clock / gate inputs read as 0;
// a floating PRE / CLR is always INACTIVE (so they can be left unconnected).
// ---------------------------------------------------------------------------
import type { Circuit, CircuitComponent, ClockEdge, FFType, GateType, Level, NetState, Point, Probe } from '../types/circuit';
import { ffDataPins, gateInputCount, onSegment, pinKey, pinsOf, ptKey } from './componentDefs';
import { ANALOG_BASE, Recorder, levelCode } from './recorder';
import { StateTracker } from './stateTracker';

/** Simulated ticks per second (1 tick = 10 ms gate delay). */
export const TPS = 100;

class UnionFind {
  p: Int32Array;
  constructor(n: number) {
    this.p = new Int32Array(n);
    for (let i = 0; i < n; i++) this.p[i] = i;
  }
  find(i: number): number {
    const p = this.p;
    while (p[i] !== i) {
      p[i] = p[p[i]];
      i = p[i];
    }
    return i;
  }
  union(a: number, b: number) {
    a = this.find(a);
    b = this.find(b);
    if (a !== b) this.p[a] = b;
  }
}

export interface CompiledTransistor {
  id: string;
  b: number;
  c: number;
  e: number;
  /** PNP: conducts while the base is LOW. */
  pnp: boolean;
}
export interface CompiledDiode {
  id: string;
  a: number;
  k: number;
}
/** Capacitor (pin 1 = node, pin 2 assumed to GND) or inductor (pin 1 → pin 2). */
export interface CompiledReactive {
  id: string;
  a: number;
  b: number;
  tau: number;
}

/** Default time constant for C / L: 40 ticks = 0.4 s. */
export const DEFAULT_TAU = 40;
export interface CompiledGate {
  id: string;
  type: GateType;
  ins: number[];
  out: number;
}
export interface CompiledFF {
  id: string;
  label: string;
  type: FFType;
  edge: ClockEdge;
  activeLow: boolean;
  initQ: boolean;
  /** S / J / D / T */
  a: number;
  /** R / K (or -1) */
  b: number;
  clk: number;
  pre: number;
  clr: number;
  q: number;
  qn: number;
}
export interface CompiledClock {
  id: string;
  out: number;
  halfTicks: number;
}

export interface CompiledCircuit {
  netCount: number;
  netOfPin: Map<string, number>;
  netOfWire: Map<string, number>;
  vccNets: number[];
  gndNets: number[];
  switches: { id: string; net: number }[];
  resistors: [number, number][];
  transistors: CompiledTransistor[];
  diodes: CompiledDiode[];
  caps: CompiledReactive[];
  inductors: CompiledReactive[];
  gates: CompiledGate[];
  ffs: CompiledFF[];
  clocks: CompiledClock[];
  /** First clock generator + the edge its directly-clocked flip-flops use. */
  mainClock: { id: string; net: number; activeEdge: ClockEdge } | null;
  /** Flip-flops labelled FF0, FF1, … ordered LSB first (counter bits). */
  counterFFs: string[];
  /** Points where three or more conductors meet (drawn as junction dots). */
  junctions: Point[];
}

export function halfPeriodTicks(freq: number | undefined) {
  const f = Math.max(0.5, Math.min(10, freq ?? 1));
  return Math.max(1, Math.round(TPS / (2 * f)));
}

export function compile(circuit: Circuit): CompiledCircuit {
  // Terminals: every pin, then every wire.
  const pinIndex = new Map<string, number>();
  const pinPos: { key: string; x: number; y: number }[] = [];
  for (const c of circuit.components) {
    for (const p of pinsOf(c)) {
      const key = pinKey(c.id, p.id);
      pinIndex.set(key, pinPos.length);
      pinPos.push({ key, x: p.x, y: p.y });
    }
  }
  const wireBase = pinPos.length;
  const uf = new UnionFind(wireBase + circuit.wires.length);

  // Everything sharing a grid point with a wire endpoint, or a pin, connects.
  const atPoint = new Map<string, number[]>();
  const add = (x: number, y: number, t: number) => {
    const k = ptKey(x, y);
    const list = atPoint.get(k);
    if (list) list.push(t);
    else atPoint.set(k, [t]);
  };
  pinPos.forEach((p, i) => add(p.x, p.y, i));
  circuit.wires.forEach((w, wi) => {
    if (w.points.length < 2) return;
    const a = w.points[0];
    const b = w.points[w.points.length - 1];
    add(a.x, a.y, wireBase + wi);
    add(b.x, b.y, wireBase + wi);
  });
  for (const list of atPoint.values()) for (let i = 1; i < list.length; i++) uf.union(list[0], list[i]);

  // Endpoints (wire ends or pins) landing on another wire's segment -> T-junction.
  const junctionCount = new Map<string, number>();
  for (const [k, list] of atPoint) junctionCount.set(k, list.length);
  const points = [...atPoint.keys()].map((k) => {
    const [x, y] = k.split(',').map(Number);
    return { k, x, y };
  });
  circuit.wires.forEach((w, wi) => {
    for (let s = 0; s + 1 < w.points.length; s++) {
      const a = w.points[s];
      const b = w.points[s + 1];
      for (const p of points) {
        if (!onSegment(p, a, b)) continue;
        const isOwnEnd =
          (s === 0 && p.x === a.x && p.y === a.y) || (s + 2 === w.points.length && p.x === b.x && p.y === b.y);
        if (isOwnEnd) continue;
        for (const t of atPoint.get(p.k)!) uf.union(t, wireBase + wi);
        junctionCount.set(p.k, (junctionCount.get(p.k) ?? 0) + 2);
      }
    }
  });

  // Dense net ids.
  const rootToNet = new Map<number, number>();
  const netOf = (t: number) => {
    const r = uf.find(t);
    let n = rootToNet.get(r);
    if (n === undefined) {
      n = rootToNet.size;
      rootToNet.set(r, n);
    }
    return n;
  };
  const netOfPin = new Map<string, number>();
  for (const [key, i] of pinIndex) netOfPin.set(key, netOf(i));
  const netOfWire = new Map<string, number>();
  circuit.wires.forEach((w, wi) => netOfWire.set(w.id, netOf(wireBase + wi)));

  const out: CompiledCircuit = {
    netCount: rootToNet.size,
    netOfPin,
    netOfWire,
    vccNets: [],
    gndNets: [],
    switches: [],
    resistors: [],
    transistors: [],
    diodes: [],
    caps: [],
    inductors: [],
    gates: [],
    ffs: [],
    clocks: [],
    mainClock: null,
    counterFFs: [],
    junctions: [],
  };
  const pn = (c: CircuitComponent, pin: string | null) => (pin ? netOfPin.get(pinKey(c.id, pin)) ?? -1 : -1);
  for (const c of circuit.components) {
    switch (c.kind) {
      case 'vcc':
        out.vccNets.push(pn(c, 'out'));
        break;
      case 'gnd':
        out.gndNets.push(pn(c, 'in'));
        break;
      case 'switch':
        out.switches.push({ id: c.id, net: pn(c, 'out') });
        break;
      case 'resistor':
        out.resistors.push([pn(c, 'A'), pn(c, 'B')]);
        break;
      case 'npn':
      case 'pnp':
        out.transistors.push({ id: c.id, b: pn(c, 'B'), c: pn(c, 'C'), e: pn(c, 'E'), pnp: c.kind === 'pnp' });
        break;
      case 'diode':
        out.diodes.push({ id: c.id, a: pn(c, 'A'), k: pn(c, 'K') });
        break;
      case 'capacitor':
      case 'inductor':
        (c.kind === 'capacitor' ? out.caps : out.inductors).push({
          id: c.id,
          a: pn(c, 'A'),
          b: pn(c, 'B'),
          tau: Math.max(1, c.tau ?? DEFAULT_TAU),
        });
        break;
      case 'gate': {
        const n = gateInputCount(c);
        out.gates.push({
          id: c.id,
          type: c.gateType ?? 'AND',
          ins: Array.from({ length: n }, (_, i) => pn(c, `I${i}`)),
          out: pn(c, 'OUT'),
        });
        break;
      }
      case 'clock':
        out.clocks.push({ id: c.id, out: pn(c, 'out'), halfTicks: halfPeriodTicks(c.freq) });
        break;
      case 'ff': {
        const type = c.ffType ?? 'D';
        const [a, b] = ffDataPins(type);
        out.ffs.push({
          id: c.id,
          label: c.label ?? 'FF',
          type,
          edge: c.edge ?? 'rising',
          activeLow: c.asyncActiveLow ?? true,
          initQ: c.initQ === 1,
          a: pn(c, a),
          b: pn(c, b),
          clk: pn(c, 'CLK'),
          pre: pn(c, 'PRE'),
          clr: pn(c, 'CLR'),
          q: pn(c, 'Q'),
          qn: pn(c, 'QN'),
        });
        break;
      }
      default:
        break;
    }
  }
  if (out.clocks.length) {
    const clk = out.clocks[0];
    const ff = out.ffs.find((f) => f.clk === clk.out);
    out.mainClock = { id: clk.id, net: clk.out, activeEdge: ff?.edge ?? 'rising' };
  }
  out.counterFFs = out.ffs
    .map((f) => ({ f, m: /^FF(\d+)$/i.exec(f.label) }))
    .filter((x) => x.m)
    .sort((a, b) => Number(a.m![1]) - Number(b.m![1]))
    .map((x) => x.f.id);

  for (const [k, n] of junctionCount) {
    if (n >= 3) {
      const [x, y] = k.split(',').map(Number);
      out.junctions.push({ x, y });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------
export interface FFState {
  q: boolean;
  qn: boolean;
  /** CLK level seen on the previous tick (null = not sampled yet). */
  prevClk: boolean | null;
  prevPre: boolean;
  prevClr: boolean;
}
export interface ClockState {
  level: boolean;
  count: number;
}
export interface Runtime {
  tOn: Map<string, boolean>;
  gates: Map<string, boolean>;
  ffs: Map<string, FFState>;
  clocks: Map<string, ClockState>;
  /** Diode output: 0 = off, 1 = passes a strong 1, 2 = passes a weak 1. */
  diodes: Map<string, 0 | 1 | 2>;
  /** Capacitor charge 0..1 (fraction of 5 V). */
  caps: Map<string, number>;
  /** Inductor current 0..1 (normalised). */
  inds: Map<string, number>;
}

const emptyRuntime = (): Runtime => ({
  tOn: new Map(),
  gates: new Map(),
  ffs: new Map(),
  clocks: new Map(),
  diodes: new Map(),
  caps: new Map(),
  inds: new Map(),
});

/** Fresh runtime for `cc`, keeping state of elements that also exist in `prev`. */
export function initRuntime(cc: CompiledCircuit, prev?: Runtime): Runtime {
  const rt = emptyRuntime();
  for (const t of cc.transistors) rt.tOn.set(t.id, prev?.tOn.get(t.id) ?? false);
  for (const d of cc.diodes) rt.diodes.set(d.id, prev?.diodes.get(d.id) ?? 0);
  for (const c of cc.caps) rt.caps.set(c.id, prev?.caps.get(c.id) ?? 0);
  for (const l of cc.inductors) rt.inds.set(l.id, prev?.inds.get(l.id) ?? 0);
  for (const g of cc.gates) rt.gates.set(g.id, prev?.gates.get(g.id) ?? false);
  for (const f of cc.ffs) {
    const p = prev?.ffs.get(f.id);
    rt.ffs.set(f.id, p ? { ...p } : { q: f.initQ, qn: !f.initQ, prevClk: null, prevPre: false, prevClr: false });
  }
  for (const c of cc.clocks) {
    const p = prev?.clocks.get(c.id);
    rt.clocks.set(c.id, p ? { level: p.level, count: Math.min(p.count, c.halfTicks - 1) } : { level: false, count: 0 });
  }
  return rt;
}

export type SwitchStates = Map<string, boolean>;

export function switchStatesOf(circuit: Circuit): SwitchStates {
  const m: SwitchStates = new Map();
  for (const c of circuit.components) if (c.kind === 'switch') m.set(c.id, !!c.on);
  return m;
}

/** Compute every net's level given switch positions and the runtime state. */
export function evaluate(cc: CompiledCircuit, switches: SwitchStates, rt: Runtime): NetState[] {
  return evaluateFull(cc, switches, rt).states;
}

export interface EvalResult {
  states: NetState[];
  /** Per capacitor: level it is being charged toward (0, 0.5 or 1), or null = no path (holds charge). */
  capTarget: Map<string, number | null>;
  /** Capacitor node is strongly driven (charges instantly). */
  capStrong: Map<string, boolean>;
}

/**
 * Drive strengths, strongest first:
 *   strong — VCC, GND, switches, gate / FF / clock outputs, diode passing a strong 1
 *   medium — capacitor node voltage, inductor output (they "hold" a node)
 *   weak   — through a resistor, or a diode passing a weak 1
 */
export function evaluateFull(cc: CompiledCircuit, switches: SwitchStates, rt: Runtime): EvalResult {
  const n = cc.netCount;
  const uf = new UnionFind(n);
  for (const t of cc.transistors) if (rt.tOn.get(t.id) && t.c >= 0 && t.e >= 0) uf.union(t.c, t.e);

  // Strong drivers per super-net. bit0 = H, bit1 = L
  const drive = new Uint8Array(n);
  const put = (net: number, high: boolean) => {
    if (net >= 0) drive[uf.find(net)] |= high ? 1 : 2;
  };
  for (const v of cc.vccNets) put(v, true);
  for (const g of cc.gndNets) put(g, false);
  for (const s of cc.switches) put(s.net, !!switches.get(s.id));
  for (const g of cc.gates) put(g.out, !!rt.gates.get(g.id));
  for (const c of cc.clocks) put(c.out, !!rt.clocks.get(c.id)?.level);
  for (const f of cc.ffs) {
    const s = rt.ffs.get(f.id);
    if (!s) continue;
    put(f.q, s.q);
    put(f.qn, s.qn);
  }
  const weakSrc = new Uint8Array(n);
  for (const d of cc.diodes) {
    const v = rt.diodes.get(d.id) ?? 0;
    if (d.k < 0 || !v) continue;
    if (v === 1) put(d.k, true);
    else weakSrc[uf.find(d.k)] |= 1;
  }

  // Medium drivers (capacitor node voltage, inductor output) on non-strong nets.
  const medium = new Uint8Array(n);
  for (const c of cc.caps) {
    if (c.a < 0) continue;
    const r = uf.find(c.a);
    if (!drive[r]) medium[r] |= (rt.caps.get(c.id) ?? 0) >= 0.5 ? 1 : 2;
  }
  for (const l of cc.inductors) {
    if (l.b < 0) continue;
    const r = uf.find(l.b);
    if (!drive[r]) medium[r] |= (rt.inds.get(l.id) ?? 0) >= 0.5 ? 1 : 2;
  }
  const bound = (r: number) => drive[r] || medium[r];

  // Cluster undriven super-nets connected through resistors; collect the
  // strong / medium levels on the cluster's boundary.
  const cl = new UnionFind(n);
  for (const [a, b] of cc.resistors) {
    if (a < 0 || b < 0) continue;
    const ra = uf.find(a);
    const rb = uf.find(b);
    if (ra !== rb && !bound(ra) && !bound(rb)) cl.union(ra, rb);
  }
  const weak = new Uint8Array(n); // per cluster root: bit0 H, bit1 L
  for (let i = 0; i < n; i++) {
    const r = uf.find(i);
    if (i === r && weakSrc[r] && !bound(r)) weak[cl.find(r)] |= weakSrc[r];
  }
  for (const [a, b] of cc.resistors) {
    if (a < 0 || b < 0) continue;
    const ra = uf.find(a);
    const rb = uf.find(b);
    if (ra === rb) continue;
    if (bound(ra) && !bound(rb)) weak[cl.find(rb)] |= bound(ra);
    if (bound(rb) && !bound(ra)) weak[cl.find(ra)] |= bound(rb);
  }

  const states: NetState[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = uf.find(i);
    const d = drive[r];
    const m = medium[r];
    if (d) {
      states[i] = { level: d === 3 ? 'X' : d === 1 ? 'H' : 'L', strength: 'strong' };
    } else if (m) {
      states[i] = { level: m === 3 ? 'X' : m === 1 ? 'H' : 'L', strength: 'weak' };
    } else {
      const w = weak[cl.find(r)];
      states[i] =
        w === 0
          ? { level: 'Z', strength: 'none' }
          : { level: w === 3 ? 'X' : w === 1 ? 'H' : 'L', strength: 'weak' };
    }
  }

  // Where is each capacitor being charged to? (sources other than itself)
  const capTarget = new Map<string, number | null>();
  const capStrong = new Map<string, boolean>();
  for (const c of cc.caps) {
    if (c.a < 0) {
      capTarget.set(c.id, null);
      continue;
    }
    const r = uf.find(c.a);
    if (drive[r]) {
      capStrong.set(c.id, true);
      capTarget.set(c.id, drive[r] === 1 ? 1 : drive[r] === 2 ? 0 : 0.5);
      continue;
    }
    let bits = weakSrc[r];
    for (const [a, b] of cc.resistors) {
      if (a < 0 || b < 0) continue;
      const ra = uf.find(a);
      const rb = uf.find(b);
      if (ra === r && rb !== r) bits |= bound(rb);
      if (rb === r && ra !== r) bits |= bound(ra);
    }
    // inductors feeding this node also charge it
    for (const l of cc.inductors) if (l.b >= 0 && uf.find(l.b) === r) bits |= (rt.inds.get(l.id) ?? 0) >= 0.5 ? 1 : 2;
    capTarget.set(c.id, bits === 0 ? null : bits === 1 ? 1 : bits === 2 ? 0 : 0.5);
  }
  return { states, capTarget, capStrong };
}

export function evalGate(type: GateType, v: boolean[]): boolean {
  switch (type) {
    case 'NOT':
      return !v[0];
    case 'AND':
      return v.every(Boolean);
    case 'NAND':
      return !v.every(Boolean);
    case 'OR':
      return v.some(Boolean);
    case 'NOR':
      return !v.some(Boolean);
    case 'XOR':
      return v.filter(Boolean).length % 2 === 1;
    case 'XNOR':
      return v.filter(Boolean).length % 2 === 0;
  }
}

/** Next Q for a synchronous (clocked) update. Returns [q, qn]. */
export function ffNext(type: FFType, a: boolean, b: boolean, q: boolean): [boolean, boolean] {
  switch (type) {
    case 'D':
      return [a, !a];
    case 'T':
      return a ? [!q, q] : [q, !q];
    case 'JK':
      if (a && b) return [!q, q];
      if (a) return [true, false];
      if (b) return [false, true];
      return [q, !q];
    case 'SR':
      if (a && b) return [true, true]; // forbidden: both outputs HIGH
      if (a) return [true, false];
      if (b) return [false, true];
      return [q, !q];
  }
}

export interface AsyncEvent {
  ffId: string;
  label: string;
  kind: 'PRE' | 'CLR';
}

export interface StepResult {
  rt: Runtime;
  changed: boolean;
  /** PRE / CLR inputs that became active this tick. */
  asyncEvents: AsyncEvent[];
  /** Any PRE / CLR currently active. */
  asyncActive: boolean;
}

export function step(cc: CompiledCircuit, switches: SwitchStates, rt: Runtime, clockRunning: boolean): StepResult {
  const ev = evaluateFull(cc, switches, rt);
  const states = ev.states;
  const lvl = (n: number): Level => (n < 0 ? 'Z' : states[n].level);
  const bit = (n: number) => lvl(n) === 'H';
  const next = emptyRuntime();
  let changed = false;
  const asyncEvents: AsyncEvent[] = [];
  let asyncActive = false;

  for (const t of cc.transistors) {
    const v = lvl(t.b) === (t.pnp ? 'L' : 'H');
    if ((rt.tOn.get(t.id) ?? false) !== v) changed = true;
    next.tOn.set(t.id, v);
  }
  for (const d of cc.diodes) {
    const s = d.a < 0 ? undefined : states[d.a];
    const v: 0 | 1 | 2 = s?.level === 'H' ? (s.strength === 'strong' ? 1 : 2) : 0;
    if ((rt.diodes.get(d.id) ?? 0) !== v) changed = true;
    next.diodes.set(d.id, v);
  }
  // Exponential RC-like approach toward the target: x += (target − x) / τ.
  const approach = (x: number, target: number, tau: number) => {
    let nx = x + (target - x) / tau;
    if (Math.abs(target - nx) < 0.01) nx = target;
    return nx;
  };
  for (const c of cc.caps) {
    const x = rt.caps.get(c.id) ?? 0;
    const target = ev.capTarget.get(c.id);
    let nx = x;
    if (target !== null && target !== undefined) nx = ev.capStrong.get(c.id) ? target : approach(x, target, c.tau);
    if (Math.abs(nx - x) > 1e-6) changed = true;
    next.caps.set(c.id, nx);
  }
  for (const l of cc.inductors) {
    const x = rt.inds.get(l.id) ?? 0;
    const a = l.a < 0 ? 'Z' : states[l.a].level;
    // Floating input: the current decays toward 0.
    const target = a === 'H' ? 1 : a === 'X' ? 0.5 : 0;
    const nx = approach(x, target, l.tau);
    if (Math.abs(nx - x) > 1e-6) changed = true;
    next.inds.set(l.id, nx);
  }
  for (const g of cc.gates) {
    const v = evalGate(g.type, g.ins.map(bit));
    if ((rt.gates.get(g.id) ?? false) !== v) changed = true;
    next.gates.set(g.id, v);
  }
  for (const f of cc.ffs) {
    const s = rt.ffs.get(f.id)!;
    const clk = bit(f.clk);
    const active = (net: number) => {
      const l = lvl(net);
      return f.activeLow ? l === 'L' : l === 'H';
    };
    const pre = f.pre >= 0 && active(f.pre);
    const clr = f.clr >= 0 && active(f.clr);
    let q = s.q;
    let qn = s.qn;
    const edge = s.prevClk !== null && (f.edge === 'rising' ? !s.prevClk && clk : s.prevClk && !clk);
    if (pre || clr) {
      asyncActive = true;
      q = pre;
      qn = clr;
    } else if (edge) {
      [q, qn] = ffNext(f.type, bit(f.a), bit(f.b), s.q);
    }
    if (pre && !s.prevPre) asyncEvents.push({ ffId: f.id, label: f.label, kind: 'PRE' });
    if (clr && !s.prevClr) asyncEvents.push({ ffId: f.id, label: f.label, kind: 'CLR' });
    if (q !== s.q || qn !== s.qn) changed = true;
    next.ffs.set(f.id, { q, qn, prevClk: clk, prevPre: pre, prevClr: clr });
  }
  for (const c of cc.clocks) {
    const s = rt.clocks.get(c.id) ?? { level: false, count: 0 };
    let { level, count } = s;
    if (clockRunning) {
      count++;
      if (count >= c.halfTicks) {
        count = 0;
        level = !level;
        changed = true;
      }
    }
    next.clocks.set(c.id, { level, count });
  }
  return { rt: next, changed, asyncEvents, asyncActive };
}

export interface SettleResult {
  states: NetState[];
  rt: Runtime;
  stable: boolean;
  steps: number;
}

/** Run (clocks stopped) until nothing changes, or give up: oscillation. */
export function settle(cc: CompiledCircuit, switches: SwitchStates, rt: Runtime = initRuntime(cc), maxSteps = 256): SettleResult {
  let cur = rt;
  for (let i = 0; i < maxSteps; i++) {
    const r = step(cc, switches, cur, false);
    cur = r.rt;
    if (!r.changed) return { states: evaluate(cc, switches, cur), rt: cur, stable: true, steps: i };
  }
  return { states: evaluate(cc, switches, cur), rt: cur, stable: false, steps: maxSteps };
}

export const levelToBit = (l: Level): 0 | 1 | null => (l === 'H' ? 1 : l === 'L' ? 0 : null);

export function describeNet(s: NetState | undefined): string {
  if (!s) return 'unconnected';
  switch (s.level) {
    case 'H':
      return `HIGH · 5.0 V · logic 1 (${s.strength})`;
    case 'L':
      return `LOW · 0.0 V · logic 0 (${s.strength})`;
    case 'Z':
      return 'FLOATING · ? V · no driver (reads 0; PRE/CLR inactive)';
    case 'X':
      return s.strength === 'strong' ? 'SHORT CIRCUIT · 5 V fighting 0 V' : 'CONFLICT · resistor divider';
  }
}

/**
 * Stateful simulator used by the UI: keeps runtime state between frames,
 * records probes for the timing diagram and tracks counter states.
 * Simulated time only advances while the clock runs or the circuit is still
 * settling, so stepping edge-by-edge gives a compact, readable diagram.
 */
export class LiveSimulator {
  private cc: CompiledCircuit;
  private rt: Runtime;
  private switches: SwitchStates = new Map();
  private probeNets: { id: string; net: number; cap?: string; ind?: string }[] = [];
  states: NetState[] = [];
  time = 0;
  quiet = 0;
  clockRunning = true;
  readonly recorder = new Recorder();
  readonly tracker = new StateTracker();
  /** Bumped on every tick; lets React panels poll cheaply. */
  version = 0;

  constructor(circuit: Circuit) {
    this.cc = compile(circuit);
    this.rt = initRuntime(this.cc);
    this.reset(circuit);
  }

  get compiled() {
    return this.cc;
  }

  /** Recompile after an edit, keeping the state of surviving parts. */
  reload(circuit: Circuit) {
    this.cc = compile(circuit);
    this.rt = initRuntime(this.cc, this.rt);
    this.switches = switchStatesOf(circuit);
    this.setProbes(circuit.probes ?? []);
    this.states = evaluate(this.cc, this.switches, this.rt);
    this.quiet = 0;
  }

  private setProbes(probes: Probe[]) {
    // A probe on a capacitor node / inductor output records the analog value.
    const capByNet = new Map<number, string>();
    for (const c of this.cc.caps) if (c.a >= 0 && !capByNet.has(c.a)) capByNet.set(c.a, c.id);
    const indByNet = new Map<number, string>();
    for (const l of this.cc.inductors) if (l.b >= 0 && !indByNet.has(l.b)) indByNet.set(l.b, l.id);
    this.probeNets = probes.map((p) => {
      const net =
        p.target.type === 'wire'
          ? this.cc.netOfWire.get(p.target.wireId)
          : this.cc.netOfPin.get(pinKey(p.target.componentId, p.target.pinId));
      const n = net ?? -1;
      return { id: p.id, net: n, cap: capByNet.get(n), ind: indByNet.get(n) };
    });
  }

  /** Recorded code for a probe: 0..3 digital, or ANALOG_BASE + 0..100 (%) for C / L. */
  private probeCode(p: { net: number; cap?: string; ind?: string }) {
    const s = this.states[p.net];
    if (p.cap && s?.strength !== 'strong') return ANALOG_BASE + Math.round((this.rt.caps.get(p.cap) ?? 0) * 100);
    if (p.ind && s?.strength !== 'strong') return ANALOG_BASE + Math.round((this.rt.inds.get(p.ind) ?? 0) * 100);
    return p.net < 0 ? 2 : levelCode(s.level);
  }

  capCharge(id: string) {
    return this.rt.caps.get(id) ?? 0;
  }
  indCurrent(id: string) {
    return this.rt.inds.get(id) ?? 0;
  }
  diodeOn(id: string) {
    return (this.rt.diodes.get(id) ?? 0) > 0;
  }

  /** Hard reset: power-on state for every element, clear recordings. */
  reset(circuit: Circuit) {
    this.cc = compile(circuit);
    this.rt = initRuntime(this.cc);
    this.switches = switchStatesOf(circuit);
    this.setProbes(circuit.probes ?? []);
    // Silent warm-up: let gates settle around the power-on flip-flop states
    // so the recording starts from a steady circuit.
    for (let i = 0; i < 64; i++) {
      const r = step(this.cc, this.switches, this.rt, false);
      this.rt = r.rt;
      if (!r.changed) break;
    }
    this.states = evaluate(this.cc, this.switches, this.rt);
    this.time = 0;
    this.quiet = 0;
    this.recorder.clear();
    this.tracker.reset();
  }

  shouldAdvance() {
    return (this.clockRunning && this.cc.clocks.length > 0) || this.quiet < 8;
  }

  tick() {
    const r = step(this.cc, this.switches, this.rt, this.clockRunning);
    this.rt = r.rt;
    this.states = evaluate(this.cc, this.switches, this.rt);
    this.quiet = r.changed ? 0 : this.quiet + 1;
    this.time++;
    this.version++;
    const counter = this.counterValue();
    const mc = this.cc.mainClock;
    this.recorder.push({
      t: this.time,
      probes: this.probeNets.map((p) => ({ id: p.id, code: this.probeCode(p) })),
      clock: mc ? (this.rt.clocks.get(mc.id)?.level ? 1 : 0) : -1,
      counter: counter ?? -1,
      counterBits: this.cc.counterFFs.length,
      activeEdge: mc?.activeEdge ?? 'rising',
      events: r.asyncEvents,
    });
    if (counter !== null) this.tracker.update(this.time, counter, this.cc.counterFFs.length, r.asyncActive);
  }

  /** Toggle every clock generator once (one edge), even while paused. */
  stepEdge() {
    for (const [id, s] of this.rt.clocks) this.rt.clocks.set(id, { level: !s.level, count: 0 });
    this.states = evaluate(this.cc, this.switches, this.rt);
    this.quiet = 0;
  }

  toggleClock(id: string) {
    const s = this.rt.clocks.get(id);
    if (!s) return;
    this.rt.clocks.set(id, { level: !s.level, count: 0 });
    this.states = evaluate(this.cc, this.switches, this.rt);
    this.quiet = 0;
  }

  counterValue(): number | null {
    if (!this.cc.counterFFs.length) return null;
    let v = 0;
    this.cc.counterFFs.forEach((id, i) => {
      if (this.rt.ffs.get(id)?.q) v |= 1 << i;
    });
    return v;
  }

  isOn(id: string) {
    return this.rt.tOn.get(id) ?? false;
  }
  gateOut(id: string) {
    return this.rt.gates.get(id) ?? false;
  }
  ffState(id: string) {
    return this.rt.ffs.get(id);
  }
  clockLevel(id: string) {
    return this.rt.clocks.get(id)?.level ?? false;
  }

  pinState(componentId: string, pinId: string): NetState | undefined {
    const n = this.cc.netOfPin.get(pinKey(componentId, pinId));
    return n === undefined ? undefined : this.states[n];
  }

  wireState(wireId: string): NetState | undefined {
    const n = this.cc.netOfWire.get(wireId);
    return n === undefined ? undefined : this.states[n];
  }
}
