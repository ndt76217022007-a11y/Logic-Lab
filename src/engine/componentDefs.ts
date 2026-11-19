// Geometry for every component kind: pins (local frame), hit bounds, rotation helpers.
import type { CircuitComponent, ComponentKind, FFType, GateType, PinDef, Point, Rotation } from '../types/circuit';

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface KindInfo {
  title: string;
  hint: string;
  /** Counts toward the TRANSISTORS counter. */
  transistors: number;
}

export const KIND_INFO: Record<ComponentKind, KindInfo> = {
  vcc: { title: 'VCC 5V', hint: 'Strong HIGH supply', transistors: 0 },
  gnd: { title: 'GND', hint: 'Strong LOW (0 V)', transistors: 0 },
  switch: { title: 'Switch', hint: 'Input: click to toggle 0/1 (drives 5 V or 0 V)', transistors: 0 },
  resistor: { title: 'Resistor', hint: 'Weak link: pull-up / pull-down / base limiting', transistors: 0 },
  npn: { title: 'NPN', hint: 'Dẫn C–E khi cực gốc B ở mức CAO', transistors: 1 },
  pnp: { title: 'PNP', hint: 'Dẫn E–C khi cực gốc B ở mức THẤP (E thường nối VCC)', transistors: 1 },
  diode: { title: 'Diode', hint: 'Chỉ cho mức 1 đi một chiều A → K (anode → cathode)', transistors: 0 },
  capacitor: { title: 'Tụ điện', hint: 'Nạp/xả theo hằng số τ: giữ điện áp nút, làm chậm sườn xung (chân 2 coi như nối GND)', transistors: 0 },
  inductor: { title: 'Cuộn cảm', hint: 'Chống lại thay đổi đột ngột: chân 2 bám theo chân 1 có quán tính τ', transistors: 0 },
  probe: { title: 'Đầu dò', hint: 'Hiện mức 1/0/Z và tự ghim vào Timing Diagram', transistors: 0 },
  led: { title: 'LED', hint: 'Output: lights when its pin is HIGH', transistors: 0 },
  readout: { title: 'Readout', hint: 'Shows bits D0..Dn as OUT = value (0x..)', transistors: 0 },
  gate: { title: 'Gate', hint: 'Logic gate (1 tick = 10 ms propagation delay)', transistors: 0 },
  clock: { title: 'CLK', hint: 'Clock generator · click to toggle one edge by hand', transistors: 0 },
  ff: { title: 'Flip-Flop', hint: 'Edge-triggered flip-flop with optional PRE / CLR', transistors: 0 },
  ic: { title: 'Custom IC', hint: 'Reserved for later levels', transistors: 0 },
};

/** Input pin ids of a flip-flop, by type: [first data pin, second data pin | null]. */
export function ffDataPins(t: FFType): [string, string | null] {
  switch (t) {
    case 'SR':
      return ['S', 'R'];
    case 'JK':
      return ['J', 'K'];
    case 'D':
      return ['D', null];
    case 'T':
      return ['T', null];
  }
}

export function gateInputCount(c: Pick<CircuitComponent, 'gateType' | 'inputs'>) {
  return c.gateType === 'NOT' ? 1 : Math.max(2, Math.min(4, c.inputs ?? 2));
}

/** Input pin offsets (dy) and output x for a gate with n inputs. */
export function gateGeometry(n: number) {
  const ys = n === 1 ? [0] : n === 2 ? [-1, 1] : n === 3 ? [-1, 0, 1] : [-2, -1, 1, 2];
  const half = n === 4 ? 2.5 : 1.5;
  return { ys, half, outX: n === 4 ? 4 : 3 };
}

const OV = (s: string) => `<span style="text-decoration:overline">${s}</span>`;
/** Boolean expression of a gate: plain text and HTML (with overbars). */
export function gateExpression(type: GateType, n: number): { text: string; html: string } {
  const v = Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
  const and = v.join('·');
  const or = v.join(' + ');
  const xor = v.join(' ⊕ ');
  switch (type) {
    case 'NOT':
      return { text: "Y = A'", html: `Y = ${OV('A')}` };
    case 'AND':
      return { text: `Y = ${and}`, html: `Y = ${and}` };
    case 'OR':
      return { text: `Y = ${or}`, html: `Y = ${or}` };
    case 'NAND':
      return { text: `Y = (${and})'`, html: `Y = ${OV(and)}` };
    case 'NOR':
      return { text: `Y = (${or})'`, html: `Y = ${OV(or)}` };
    case 'XOR':
      return { text: `Y = ${xor}`, html: `Y = ${xor}` };
    case 'XNOR':
      return { text: `Y = (${xor})'`, html: `Y = ${OV(xor)}` };
  }
}

export function componentTitle(c: Pick<CircuitComponent, 'kind' | 'gateType' | 'inputs' | 'ffType'>) {
  if (c.kind === 'gate') {
    const n = gateInputCount(c);
    return `${c.gateType ?? 'AND'}${c.gateType !== 'NOT' && n > 2 ? n : ''}`;
  }
  if (c.kind === 'ff') return `${c.ffType ?? 'D'} Flip-Flop`;
  return KIND_INFO[c.kind].title;
}

type Shape = Pick<CircuitComponent, 'kind' | 'bits' | 'gateType' | 'inputs' | 'ffType'>;

export function pinDefs(c: Shape): PinDef[] {
  switch (c.kind) {
    case 'gate': {
      const { ys, outX } = gateGeometry(gateInputCount(c));
      return [
        ...ys.map((dy, i) => ({ id: `I${i}`, label: String.fromCharCode(65 + i), dx: -2, dy })),
        { id: 'OUT', label: 'Y', dx: outX, dy: 0 },
      ];
    }
    case 'clock':
      return [{ id: 'out', label: 'CLK', dx: 2, dy: 0 }];
    case 'ff': {
      const [a, b] = ffDataPins(c.ffType ?? 'D');
      const pins: PinDef[] = [{ id: a, label: a, dx: -3, dy: -2 }, { id: 'CLK', label: 'CLK', dx: -3, dy: 0 }];
      if (b) pins.push({ id: b, label: b, dx: -3, dy: 2 });
      pins.push(
        { id: 'Q', label: 'Q', dx: 3, dy: -2 },
        { id: 'QN', label: 'Q̄', dx: 3, dy: 2 },
        { id: 'PRE', label: 'PRE', dx: 0, dy: -4 },
        { id: 'CLR', label: 'CLR', dx: 0, dy: 4 },
      );
      return pins;
    }
    case 'vcc':
      return [{ id: 'out', label: '+5V', dx: 0, dy: 0 }];
    case 'gnd':
      return [{ id: 'in', label: 'GND', dx: 0, dy: 0 }];
    case 'switch':
      return [{ id: 'out', label: 'OUT', dx: 1, dy: 0 }];
    case 'resistor':
      return [
        { id: 'A', label: '1', dx: -2, dy: 0 },
        { id: 'B', label: '2', dx: 2, dy: 0 },
      ];
    case 'npn':
      return [
        { id: 'B', label: 'B', dx: -2, dy: 0 },
        { id: 'C', label: 'C', dx: 0, dy: -2 },
        { id: 'E', label: 'E', dx: 0, dy: 2 },
      ];
    case 'pnp':
      return [
        { id: 'B', label: 'B', dx: -2, dy: 0 },
        { id: 'E', label: 'E', dx: 0, dy: -2 },
        { id: 'C', label: 'C', dx: 0, dy: 2 },
      ];
    case 'diode':
      return [
        { id: 'A', label: 'A', dx: -2, dy: 0 },
        { id: 'K', label: 'K', dx: 2, dy: 0 },
      ];
    case 'capacitor':
    case 'inductor':
      return [
        { id: 'A', label: '1', dx: -2, dy: 0 },
        { id: 'B', label: '2', dx: 2, dy: 0 },
      ];
    case 'probe':
      return [{ id: 'in', label: 'IN', dx: -1, dy: 0 }];
    case 'led':
      return [{ id: 'in', label: 'IN', dx: -1, dy: 0 }];
    case 'readout': {
      const n = clampBits(c.bits);
      return Array.from({ length: n }, (_, i) => ({ id: `D${i}`, label: `D${i}`, dx: -1, dy: i }));
    }
    case 'ic':
      return [];
  }
}

export function clampBits(b?: number) {
  return Math.max(1, Math.min(8, b ?? 1));
}

export function localBounds(c: Shape): Bounds {
  switch (c.kind) {
    case 'gate': {
      const { half, outX } = gateGeometry(gateInputCount(c));
      return { x0: -1.6, y0: -half - 0.1, x1: outX - 0.5, y1: half + 0.1 };
    }
    case 'clock':
      return { x0: -1.6, y0: -1.0, x1: 1.3, y1: 1.0 };
    case 'ff':
      return { x0: -2.1, y0: -3.1, x1: 2.1, y1: 3.1 };
    case 'vcc':
      return { x0: -0.8, y0: -1.7, x1: 0.8, y1: 0.1 };
    case 'gnd':
      return { x0: -0.8, y0: -0.1, x1: 0.8, y1: 1.5 };
    case 'switch':
      return { x0: -1.7, y0: -0.8, x1: 0.6, y1: 0.8 };
    case 'resistor':
      return { x0: -1.4, y0: -0.5, x1: 1.4, y1: 0.5 };
    case 'npn':
    case 'pnp':
      return { x0: -1.2, y0: -1.2, x1: 1.2, y1: 1.2 };
    case 'diode':
      return { x0: -1.2, y0: -0.7, x1: 1.2, y1: 0.7 };
    case 'capacitor':
    case 'inductor':
      return { x0: -1.4, y0: -0.9, x1: 1.4, y1: 1.75 };
    case 'probe':
      return { x0: -0.6, y0: -0.65, x1: 1.7, y1: 0.65 };
    case 'led':
      return { x0: -0.7, y0: -0.7, x1: 0.7, y1: 0.7 };
    case 'readout':
      return { x0: -0.5, y0: -0.7, x1: 7.5, y1: clampBits(c.bits) - 0.3 };
    case 'ic':
      return { x0: -1, y0: -1, x1: 1, y1: 1 };
  }
}

/** Rotate a local offset by `rot` quarter turns clockwise (screen coords, y down). */
export function rotate(dx: number, dy: number, rot: Rotation): Point {
  switch (rot) {
    case 0:
      return { x: dx, y: dy };
    case 1:
      return { x: -dy, y: dx };
    case 2:
      return { x: -dx, y: -dy };
    case 3:
      return { x: dy, y: -dx };
  }
}

export interface PinInstance extends PinDef {
  componentId: string;
  /** Absolute grid position. */
  x: number;
  y: number;
}

export function pinsOf(c: CircuitComponent): PinInstance[] {
  return pinDefs(c).map((p) => {
    const r = rotate(p.dx, p.dy, c.rot);
    return { ...p, componentId: c.id, x: c.x + r.x, y: c.y + r.y };
  });
}

export function worldBounds(c: CircuitComponent): Bounds {
  const b = localBounds(c);
  const corners = [
    rotate(b.x0, b.y0, c.rot),
    rotate(b.x1, b.y0, c.rot),
    rotate(b.x0, b.y1, c.rot),
    rotate(b.x1, b.y1, c.rot),
  ];
  return {
    x0: c.x + Math.min(...corners.map((p) => p.x)),
    y0: c.y + Math.min(...corners.map((p) => p.y)),
    x1: c.x + Math.max(...corners.map((p) => p.x)),
    y1: c.y + Math.max(...corners.map((p) => p.y)),
  };
}

export function countTransistors(components: CircuitComponent[]) {
  return components.reduce((n, c) => n + KIND_INFO[c.kind].transistors, 0);
}

let seq = 0;
export function newId(prefix: string) {
  seq = (seq + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export const pinKey = (componentId: string, pinId: string) => `${componentId}:${pinId}`;
export const ptKey = (x: number, y: number) => `${x},${y}`;

/** Is grid point p on the closed axis-aligned segment a-b? */
export function onSegment(p: Point, a: Point, b: Point) {
  if (a.x === b.x && p.x === a.x) return p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
  if (a.y === b.y && p.y === a.y) return p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x);
  return false;
}

/** Remove duplicate and collinear interior points of an orthogonal polyline. */
export function simplifyPath(pts: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2];
      const b = out[out.length - 1];
      if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) {
        out[out.length - 1] = p;
        continue;
      }
    }
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

/** Orthogonal L-route from a to b (horizontal first unless `verticalFirst`). */
export function lRoute(a: Point, b: Point, verticalFirst = false): Point[] {
  const mid = verticalFirst ? { x: a.x, y: b.y } : { x: b.x, y: a.y };
  return simplifyPath([a, mid, b]);
}
