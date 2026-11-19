// Level 1 lessons. Coordinates are grid units; pins that share a grid point
// are connected, and wire endpoints connect to pins or other wires there.
import type { Circuit, CircuitComponent, ComponentKind, Lesson, Point, Rotation, TruthRow, Wire } from '../types/circuit';

let n = 0;
const c = (
  kind: ComponentKind,
  x: number,
  y: number,
  rot: Rotation = 0,
  extra: Partial<CircuitComponent> = {},
): CircuitComponent => ({ id: `${kind}${++n}`, kind, x, y, rot, ...extra });
const w = (...pts: [number, number][]): Wire => ({
  id: `w${++n}`,
  points: pts.map(([x, y]): Point => ({ x, y })),
});
const circuit = (name: string, components: CircuitComponent[], wires: Wire[] = []): Circuit => ({
  name,
  components,
  wires,
});
const row = (inputs: Record<string, 0 | 1>, outputs: Record<string, 0 | 1>): TruthRow => ({ inputs, outputs });

// ---------------------------------------------------------------- NOT (RTL)
//   VCC ─ R(pull-up) ─┬─ Y          A ─ R(base) ─ B[Q1]   Q1.E ─ GND
//                     └─ Q1.C
const notStarter = () =>
  circuit('NOT GATE', [
    c('vcc', 10, 2),
    c('gnd', 10, 10),
    c('switch', 3, 8, 0, { label: 'A' }),
    c('led', 14, 6, 0, { label: 'Y' }),
  ]);
const notSolution = () =>
  circuit(
    'NOT GATE',
    [
      c('vcc', 10, 2),
      c('resistor', 10, 4, 1),
      c('npn', 10, 8),
      c('gnd', 10, 10),
      c('switch', 3, 8, 0, { label: 'A' }),
      c('resistor', 6, 8),
      c('led', 14, 6, 0, { label: 'Y' }),
      c('readout', 14, 9, 0, { label: 'OUT', bits: 1 }),
    ],
    [w([10, 6], [13, 6]), w([12, 6], [12, 9], [13, 9])],
  );

// ---------------------------------------------------------------- NAND (2 NPN in series)
const nandParts = (): CircuitComponent[] => [
  c('vcc', 10, 2),
  c('resistor', 10, 4, 1),
  c('npn', 10, 8),
  c('npn', 10, 12),
  c('gnd', 10, 14),
  c('switch', 3, 8, 0, { label: 'A' }),
  c('resistor', 6, 8),
  c('switch', 3, 12, 0, { label: 'B' }),
  c('resistor', 6, 12),
];
const nandStarter = () =>
  circuit('NAND GATE', [
    c('vcc', 10, 2),
    c('gnd', 10, 14),
    c('switch', 3, 8, 0, { label: 'A' }),
    c('switch', 3, 12, 0, { label: 'B' }),
    c('led', 14, 6, 0, { label: 'Y' }),
  ]);
const nandSolution = () =>
  circuit(
    'NAND GATE',
    [...nandParts(), c('led', 14, 6, 0, { label: 'Y' }), c('readout', 14, 9, 0, { label: 'OUT', bits: 1 })],
    [w([10, 6], [13, 6]), w([12, 6], [12, 9], [13, 9])],
  );

// ---------------------------------------------------------------- AND = NAND -> NOT
const andStarter = () =>
  circuit('AND GATE', [
    c('vcc', 10, 2),
    c('vcc', 18, 2),
    c('gnd', 10, 14),
    c('gnd', 18, 10),
    c('switch', 3, 8, 0, { label: 'A' }),
    c('switch', 3, 12, 0, { label: 'B' }),
    c('led', 22, 6, 0, { label: 'Y' }),
  ]);
const andSolution = () =>
  circuit(
    'AND GATE',
    [
      ...nandParts(),
      c('resistor', 14, 8),
      c('vcc', 18, 2),
      c('resistor', 18, 4, 1),
      c('npn', 18, 8),
      c('gnd', 18, 10),
      c('led', 22, 6, 0, { label: 'Y' }),
      c('readout', 22, 9, 0, { label: 'OUT', bits: 1 }),
    ],
    [w([10, 6], [12, 6], [12, 8]), w([18, 6], [21, 6]), w([20, 6], [20, 9], [21, 9])],
  );

export const STARTER_LESSONS: Lesson[] = [
  {
    id: 'not',
    title: 'NOT Gate',
    level: 1,
    transistorBudget: 1,
    summary: 'One NPN transistor flips the signal: input HIGH pulls the output LOW.',
    steps: [
      'Pull-up: VCC → resistor → output node. With nothing else, Y reads HIGH.',
      'Place an NPN under the output node: C on the node, E on GND.',
      'Drive the base B from switch A through a resistor.',
      'A=1 turns the transistor on, which drags Y down to 0 V.',
    ],
    inputs: ['A'],
    outputs: ['Y'],
    truthTable: [row({ A: 0 }, { Y: 1 }), row({ A: 1 }, { Y: 0 })],
    starter: notStarter(),
    solution: notSolution(),
  },
  {
    id: 'nand',
    title: 'NAND Gate',
    level: 1,
    transistorBudget: 2,
    summary: 'Two NPN transistors in series: the output only falls when BOTH are on.',
    steps: [
      'Pull the output node up to VCC through a resistor.',
      'Stack two NPNs: Q1.C on the output, Q1.E → Q2.C, Q2.E → GND.',
      'Feed A into Q1.B and B into Q2.B, each through a resistor.',
      'Only A=1 AND B=1 opens a path to ground, so Y = NOT(A AND B).',
    ],
    inputs: ['A', 'B'],
    outputs: ['Y'],
    truthTable: [
      row({ A: 0, B: 0 }, { Y: 1 }),
      row({ A: 1, B: 0 }, { Y: 1 }),
      row({ A: 0, B: 1 }, { Y: 1 }),
      row({ A: 1, B: 1 }, { Y: 0 }),
    ],
    starter: nandStarter(),
    solution: nandSolution(),
  },
  {
    id: 'and',
    title: 'AND Gate',
    level: 1,
    transistorBudget: 3,
    summary: 'Chain a NAND into a NOT: two inversions cancel and you get AND.',
    steps: [
      'Build the 2-transistor NAND on the left (load the NAND solution if you like).',
      'Build a NOT stage on the right with its own pull-up and NPN.',
      'Wire the NAND output into the NOT base resistor.',
      'Y lights only when A=1 and B=1. Three transistors total.',
    ],
    inputs: ['A', 'B'],
    outputs: ['Y'],
    truthTable: [
      row({ A: 0, B: 0 }, { Y: 0 }),
      row({ A: 1, B: 0 }, { Y: 0 }),
      row({ A: 0, B: 1 }, { Y: 0 }),
      row({ A: 1, B: 1 }, { Y: 1 }),
    ],
    starter: andStarter(),
    solution: andSolution(),
  },
];

/** Deep copy so edits never mutate the lesson definitions. */
export function cloneCircuit(src: Circuit): Circuit {
  return JSON.parse(JSON.stringify(src)) as Circuit;
}

/** The pre-built 2-transistor NAND, handy as a default board. */
export const NAND_EXAMPLE = (): Circuit => cloneCircuit(STARTER_LESSONS[1].solution);
