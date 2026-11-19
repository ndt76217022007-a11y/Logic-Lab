// ---------------------------------------------------------------------------
// Truth-table runner + domino chain model.
//
// verifyCircuit() runs each lesson vector through the simulator (fresh state,
// settle to a stable point) and yields one DominoSlot per test. Passing slots
// become standing dominoes; failing slots become EMPTY GAPS.
//
// createDominoWorld() / stepDominoWorld() are a tiny hand-written rigid body
// model: each domino rotates around its front-bottom corner, transfers its
// momentum to the next one on contact, and simply falls flat if the next slot
// is empty — so the chain STOPS DEAD at the first failing vector.
// ---------------------------------------------------------------------------
import type { Circuit, Lesson, TruthRow } from '../types/circuit';
import { compile, settle, levelToBit, type SwitchStates } from './simulator';
import { pinKey } from './componentDefs';

export type Actual = 0 | 1 | 'Z' | 'X' | '?';

export interface DominoSlot {
  index: number;
  rowIndex: number;
  inputs: Record<string, 0 | 1>;
  expected: Record<string, 0 | 1>;
  actual: Record<string, Actual>;
  pass: boolean;
  note?: string;
}

export interface VerifyResult {
  slots: DominoSlot[];
  allPass: boolean;
  firstFailure: DominoSlot | null;
  /** Problems that make every vector fail (missing labelled parts). */
  setupErrors: string[];
}

export const MIN_DOMINOES = 10;

/** Repeat the truth table until there are at least `min` vectors. */
export function expandVectors(rows: TruthRow[], min = MIN_DOMINOES): { row: TruthRow; rowIndex: number }[] {
  if (rows.length === 0) return [];
  const reps = Math.max(1, Math.ceil(min / rows.length));
  const out: { row: TruthRow; rowIndex: number }[] = [];
  for (let r = 0; r < reps; r++) rows.forEach((row, i) => out.push({ row, rowIndex: i }));
  return out;
}

export function verifyCircuit(circuit: Circuit, lesson: Pick<Lesson, 'inputs' | 'outputs' | 'truthTable'>): VerifyResult {
  const cc = compile(circuit);
  const setupErrors: string[] = [];

  const switchByLabel = new Map<string, string>();
  const ledByLabel = new Map<string, string>();
  for (const c of circuit.components) {
    if (c.kind === 'switch' && c.label) switchByLabel.set(c.label, c.id);
    if (c.kind === 'led' && c.label) ledByLabel.set(c.label, c.id);
  }
  for (const i of lesson.inputs) if (!switchByLabel.has(i)) setupErrors.push(`No switch labelled "${i}"`);
  for (const o of lesson.outputs) if (!ledByLabel.has(o)) setupErrors.push(`No LED labelled "${o}"`);

  // Cache per distinct row: the circuit is deterministic per vector.
  const cache = new Map<number, Pick<DominoSlot, 'actual' | 'pass' | 'note'>>();
  const runRow = (row: TruthRow, rowIndex: number) => {
    const hit = cache.get(rowIndex);
    if (hit) return hit;
    const sw: SwitchStates = new Map();
    for (const c of circuit.components) if (c.kind === 'switch') sw.set(c.id, !!c.on);
    for (const [label, v] of Object.entries(row.inputs)) {
      const id = switchByLabel.get(label);
      if (id) sw.set(id, v === 1);
    }
    const res = settle(cc, sw);
    const actual: Record<string, Actual> = {};
    let pass = setupErrors.length === 0 && res.stable;
    for (const [label, want] of Object.entries(row.outputs)) {
      const id = ledByLabel.get(label);
      if (!id) {
        actual[label] = '?';
        pass = false;
        continue;
      }
      const net = cc.netOfPin.get(pinKey(id, 'in'));
      const level = net === undefined ? 'Z' : res.states[net].level;
      const bit = levelToBit(level);
      actual[label] = bit ?? (level as 'Z' | 'X');
      if (bit !== want) pass = false;
    }
    const note = setupErrors[0] ?? (res.stable ? undefined : 'Circuit oscillates (never settles)');
    const out = { actual, pass, note };
    cache.set(rowIndex, out);
    return out;
  };

  const slots: DominoSlot[] = expandVectors(lesson.truthTable).map(({ row, rowIndex }, index) => ({
    index,
    rowIndex,
    inputs: row.inputs,
    expected: row.outputs,
    ...runRow(row, rowIndex),
  }));
  const firstFailure = slots.find((s) => !s.pass) ?? null;
  return { slots, allPass: !firstFailure && slots.length > 0, firstFailure, setupErrors };
}

export function formatInputs(inputs: Record<string, 0 | 1>, sep = ', ') {
  return Object.entries(inputs)
    .map(([k, v]) => `${k}=${v}`)
    .join(sep);
}

export function failureBanner(slot: DominoSlot) {
  return `ONE SPOT EMPTY — IT STOPS DEAD (Failed at ${formatInputs(slot.inputs)})`;
}
export const SUCCESS_BANNER = 'ALL FALL — CIRCUIT VERIFIED!';

// ---------------------------------------------------------------------------
// Domino physics
// ---------------------------------------------------------------------------

export interface DominoBody {
  slot: DominoSlot;
  present: boolean;
  /** x of the pivot (front-bottom corner), px. */
  pivotX: number;
  /** Tilt from vertical, radians (falls toward +x). */
  theta: number;
  omega: number;
  /** Has received a push. */
  falling: boolean;
  /** Resting on the next domino (angle constrained by it). */
  leaning: boolean;
  settled: boolean;
  hitAt: number | null;
  color: string;
}

export interface DominoWorld {
  bodies: DominoBody[];
  height: number;
  width: number;
  spacing: number;
  groundY: number;
  originX: number;
  time: number;
  pusherX: number;
  pusherDone: boolean;
  finished: boolean;
  /** Index of the last domino that fell before a gap (or end). */
  stopIndex: number | null;
}

const PALETTE = ['#4de8ff', '#ffc94a', '#ff5fa2', '#8b7bff', '#5dff9b', '#ff8a4a'];
const GRAVITY = 2600; // px/s^2
const PUSH_OMEGA = 2.6; // rad/s

export function createDominoWorld(slots: DominoSlot[], viewWidth: number, groundY: number): DominoWorld {
  const n = Math.max(1, slots.length);
  const margin = 70;
  const spacing = Math.max(26, Math.min(64, (viewWidth - margin * 2) / n));
  // Geometry chosen so a domino reaches the next one (height > spacing - width)
  // but NOT the one after a gap (height < 2*spacing - width).
  const height = spacing * 1.45;
  const width = spacing * 0.3;
  const originX = (viewWidth - spacing * (n - 1) - width) / 2 + width;
  return {
    bodies: slots.map((slot, i) => ({
      slot,
      present: slot.pass,
      pivotX: originX + i * spacing,
      theta: 0,
      omega: 0,
      falling: false,
      leaning: false,
      settled: false,
      hitAt: null,
      color: PALETTE[slot.rowIndex % PALETTE.length],
    })),
    height,
    width,
    spacing,
    groundY,
    originX,
    time: 0,
    pusherX: originX - width - 60,
    pusherDone: false,
    finished: false,
    stopIndex: null,
  };
}

/** Contact angle at which a domino's top edge touches the next domino's face. */
function contactAngle(w: DominoWorld) {
  return Math.asin(Math.min(1, (w.spacing - w.width) / w.height));
}

export interface DominoEvent {
  type: 'hit' | 'stop' | 'done';
  index: number;
}

export function stepDominoWorld(w: DominoWorld, dt: number): DominoEvent[] {
  const events: DominoEvent[] = [];
  if (w.finished) return events;
  w.time += dt;
  const sub = 4;
  const h = dt / sub;
  const thetaC = contactAngle(w);
  const flat = Math.PI / 2;

  for (let s = 0; s < sub; s++) {
    // Pusher slides into the first slot.
    if (!w.pusherDone) {
      w.pusherX += 220 * h;
      const first = w.bodies[0];
      const faceX = first ? first.pivotX - w.width : w.originX;
      if (w.pusherX >= faceX - 2) {
        w.pusherDone = true;
        if (first && first.present) {
          first.falling = true;
          first.omega = PUSH_OMEGA;
          first.hitAt = w.time;
          events.push({ type: 'hit', index: 0 });
        } else {
          w.stopIndex = -1;
        }
      }
    }

    for (let i = w.bodies.length - 1; i >= 0; i--) {
      const b = w.bodies[i];
      if (!b.present || !b.falling || b.settled) continue;
      const next = w.bodies[i + 1];
      const nextStands = next && next.present;

      if (b.leaning && nextStands) {
        // Rest against the next domino: follow its tilt.
        const target = Math.min(flat - 0.05, thetaC + next.theta * 0.82);
        b.theta += (target - b.theta) * Math.min(1, h * 30);
        if (next.settled && Math.abs(target - b.theta) < 0.002) b.settled = true;
        continue;
      }

      // Free rotation about the pivot (rod about its end).
      const alpha = ((3 * GRAVITY) / (2 * w.height)) * Math.sin(b.theta + 0.05);
      b.omega += alpha * h;
      b.theta += b.omega * h;

      if (nextStands && b.theta >= thetaC) {
        b.theta = thetaC;
        b.leaning = true;
        if (!next.falling) {
          next.falling = true;
          next.hitAt = w.time;
          events.push({ type: 'hit', index: i + 1 });
        }
        next.omega = Math.max(next.omega, b.omega * 0.75);
        b.omega = 0;
      } else if (b.theta >= flat) {
        // Hits the ground.
        b.theta = flat;
        if (b.omega > 1.2) b.omega = -b.omega * 0.18;
        else {
          b.omega = 0;
          b.settled = true;
          if (!nextStands) {
            w.stopIndex = i;
            events.push({ type: 'stop', index: i });
          }
        }
      }
    }
  }

  const active = w.bodies.some((b) => b.present && b.falling && !b.settled);
  if (w.pusherDone && !active && w.stopIndex !== null) {
    w.finished = true;
    events.push({ type: 'done', index: w.stopIndex });
  }
  return events;
}
