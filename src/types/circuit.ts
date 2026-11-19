// ---------------------------------------------------------------------------
// Core data model for the logic lab.
// All positions are in GRID units (integers). One grid unit = GRID_PX pixels
// at zoom 1. Rotation is in quarter turns, clockwise.
// ---------------------------------------------------------------------------

export const GRID_PX = 20;

export interface Point {
  x: number;
  y: number;
}

export type Rotation = 0 | 1 | 2 | 3;

/** Primitive component kinds. `ic` is reserved for custom chips (later levels). */
export type ComponentKind =
  | 'vcc'
  | 'gnd'
  | 'switch'
  | 'resistor'
  | 'npn'
  | 'pnp'
  | 'diode'
  | 'capacitor'
  | 'inductor'
  | 'probe'
  | 'led'
  | 'readout'
  | 'gate'
  | 'clock'
  | 'ff'
  | 'ic';

export type GateType = 'NOT' | 'AND' | 'OR' | 'NAND' | 'NOR' | 'XOR' | 'XNOR';
export type FFType = 'SR' | 'JK' | 'D' | 'T';
export type ClockEdge = 'rising' | 'falling';

/** A pin definition in a component's LOCAL (unrotated) frame. */
export interface PinDef {
  id: string; // e.g. 'B', 'C', 'E', 'out', 'D0'
  label: string;
  dx: number;
  dy: number;
}

/** Placed component instance. */
export interface CircuitComponent {
  id: string;
  kind: ComponentKind;
  x: number;
  y: number;
  rot: Rotation;
  /** User label, used by lessons to find inputs/outputs (e.g. 'A', 'B', 'Y'). */
  label?: string;
  /** Switch state. */
  on?: boolean;
  /** Readout width in bits (1..8). */
  bits?: number;
  /** Custom IC reference (future levels). */
  icId?: string;

  // --- logic gates
  gateType?: GateType;
  /** Number of inputs (2, 3 or 4). NOT always has 1. */
  inputs?: number;

  // --- capacitor / inductor
  /** Time constant τ in ticks (1 tick = 10 ms). */
  tau?: number;

  // --- clock generator
  /** Frequency in Hz (0.5 .. 10), in simulated time. */
  freq?: number;

  // --- flip-flops
  ffType?: FFType;
  /** Active clock edge. */
  edge?: ClockEdge;
  /** PRE / CLR polarity: true = active-LOW (bubbles, PRĒ / CLR̄). */
  asyncActiveLow?: boolean;
  /** Power-on state. */
  initQ?: 0 | 1;
}

/** A signal pinned to the timing diagram. */
export type ProbeTarget = { type: 'pin'; componentId: string; pinId: string } | { type: 'wire'; wireId: string };

export interface Probe {
  id: string;
  label: string;
  target: ProbeTarget;
}

/** An orthogonal polyline. Endpoints connect to anything at the same grid
 *  point (pins, other wire endpoints) or lying on another wire's segment. */
export interface Wire {
  id: string;
  points: Point[];
}

export interface Circuit {
  name: string;
  components: CircuitComponent[];
  wires: Wire[];
  /** Signals recorded by the timing diagram (in display order). */
  probes?: Probe[];
}

/** Absolute pin instance resolved for a placed component. */
export interface PinRef {
  componentId: string;
  pinId: string;
}

// ---------------------------------------------------------------------------
// Signal model (switch-level)
// ---------------------------------------------------------------------------

/** Net logic level. Z = floating (no driver), X = conflict / short circuit. */
export type Level = 'H' | 'L' | 'Z' | 'X';

/** Drive strength: strong = supply / switch / ON transistor path, weak = through a resistor. */
export type Strength = 'strong' | 'weak' | 'none';

export interface NetState {
  level: Level;
  strength: Strength;
}

// ---------------------------------------------------------------------------
// Custom ICs (future): a sub-circuit exposed through labelled ports.
// ---------------------------------------------------------------------------

export interface CustomIC {
  id: string;
  name: string;
  circuit: Circuit;
  inputs: string[]; // switch labels inside `circuit`
  outputs: string[]; // led labels inside `circuit`
}

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

export interface TruthRow {
  inputs: Record<string, 0 | 1>;
  outputs: Record<string, 0 | 1>;
}

export interface Lesson {
  id: string;
  title: string;
  level: number;
  /** Target transistor count shown as a hint. */
  transistorBudget: number;
  summary: string;
  steps: string[];
  inputs: string[]; // switch labels
  outputs: string[]; // led labels
  truthTable: TruthRow[];
  /** Starting board (supplies, labelled inputs and outputs). */
  starter: Circuit;
  /** Reference solution, loadable via "Load Solution". */
  solution: Circuit;
}

/** File format for Export / Import. */
export interface CircuitFile {
  format: 'logic-lab-circuit';
  version: 1;
  circuit: Circuit;
}
