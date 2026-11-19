// Auto-grading for "lắp mạch" (build) exercises: runs a private headless
// simulator on a copy of the student's circuit — the live simulation is untouched.
import type { Circuit, FFType } from '../types/circuit';
import { LiveSimulator } from '../engine/simulator';
import { cloneCircuit } from '../lessons/starterLessons';

export type BuildCheck =
  | { kind: 'latch'; gate: 'NAND' | 'NOR' }
  | { kind: 'jk' }
  | { kind: 'counter'; expected: number[]; bits: number; ffType?: FFType; sync?: boolean; edge?: 'rising' | 'falling' };

export interface CheckResult {
  ok: boolean;
  lines: { ok: boolean; text: string }[];
}

const norm = (s?: string) => (s ?? '').normalize('NFC').replace(/̄|̅/g, '̄').toUpperCase();
const isBar = (s?: string) => /̄|'|^\//.test(norm(s));
const base = (s?: string) => norm(s).replace(/[̄'/]/g, '');

function settle(sim: LiveSimulator, max = 400) {
  for (let i = 0; i < max && sim.shouldAdvance(); i++) sim.tick();
}

function findSwitch(c: Circuit, name: string, bar: boolean) {
  return c.components.find((x) => x.kind === 'switch' && base(x.label) === name && isBar(x.label) === bar)
    ?? c.components.find((x) => x.kind === 'switch' && base(x.label) === name);
}
function findLed(c: Circuit, name: string, bar = false) {
  return c.components.find((x) => x.kind === 'led' && base(x.label) === name && isBar(x.label) === bar);
}

function ledLevel(sim: LiveSimulator, id: string) {
  return sim.pinState(id, 'in')?.level === 'H' ? 1 : 0;
}

export function runCheck(circuit: Circuit, check: BuildCheck): CheckResult {
  const lines: CheckResult['lines'] = [];
  const add = (ok: boolean, text: string) => lines.push({ ok, text });
  const c = cloneCircuit(circuit);

  if (check.kind === 'latch') {
    const nand = check.gate === 'NAND';
    const sw = { S: findSwitch(c, 'S', nand), R: findSwitch(c, 'R', nand) };
    const q = findLed(c, 'Q');
    if (!sw.S || !sw.R || !q) {
      add(false, `Cần công tắc ${nand ? 'S̄, R̄' : 'S, R'} và đèn LED tên Q (đặt tên trong Inspector).`);
      return { ok: false, lines };
    }
    const gates = c.components.filter((x) => x.kind === 'gate');
    add(gates.length === 2 && gates.every((g) => g.gateType === check.gate), `Dùng đúng 2 cổng ${check.gate} (đang có: ${gates.map((g) => g.gateType).join(', ') || 'không có'})`);
    const sim = new LiveSimulator(c);
    sim.clockRunning = false;
    const set = (s: number, r: number) => {
      sw.S!.on = !!s;
      sw.R!.on = !!r;
      sim.reload(c);
      settle(sim);
    };
    // NAND: active-LOW inputs. NOR: active-HIGH.
    const steps: [number, number, number, string][] = nand
      ? [
          [0, 1, 1, 'S̄=0, R̄=1 → Set, Q = 1'],
          [1, 1, 1, 'S̄=1, R̄=1 → Giữ, Q = 1'],
          [1, 0, 0, 'S̄=1, R̄=0 → Reset, Q = 0'],
          [1, 1, 0, 'S̄=1, R̄=1 → Giữ, Q = 0'],
        ]
      : [
          [1, 0, 1, 'S=1, R=0 → Set, Q = 1'],
          [0, 0, 1, 'S=0, R=0 → Giữ, Q = 1'],
          [0, 1, 0, 'S=0, R=1 → Reset, Q = 0'],
          [0, 0, 0, 'S=0, R=0 → Giữ, Q = 0'],
        ];
    for (const [s, r, want, label] of steps) {
      set(s, r);
      const got = ledLevel(sim, q.id);
      add(got === want, `${label} (đo được Q = ${got})`);
    }
    return { ok: lines.every((l) => l.ok), lines };
  }

  if (check.kind === 'jk') {
    const J = findSwitch(c, 'J', false);
    const K = findSwitch(c, 'K', false);
    const q = findLed(c, 'Q');
    const clocks = c.components.filter((x) => x.kind === 'clock');
    if (!J || !K || !q || !clocks.length) {
      add(false, 'Cần công tắc J, K, một CLK và đèn LED tên Q.');
      return { ok: false, lines };
    }
    const sim = new LiveSimulator(c);
    sim.clockRunning = false;
    // force clock low first
    for (const k of clocks) if (sim.clockLevel(k.id)) sim.toggleClock(k.id);
    settle(sim);
    const pulse = () => {
      for (let t = 0; t < 2; t++) {
        for (const k of clocks) sim.toggleClock(k.id);
        settle(sim);
      }
    };
    const steps: [number, number, number, string][] = [
      [0, 1, 0, 'J=0, K=1 → Reset → Q = 0'],
      [1, 0, 1, 'J=1, K=0 → Set → Q = 1'],
      [0, 0, 1, 'J=0, K=0 → Giữ → Q = 1'],
      [1, 1, 0, 'J=1, K=1 → Đảo → Q = 0'],
      [1, 1, 1, 'J=1, K=1 → Đảo → Q = 1'],
      [0, 0, 1, 'J=0, K=0 → Giữ → Q = 1'],
      [0, 1, 0, 'J=0, K=1 → Reset → Q = 0'],
    ];
    for (const [j, k, want, label] of steps) {
      J.on = !!j;
      K.on = !!k;
      sim.reload(c);
      settle(sim);
      pulse();
      const got = ledLevel(sim, q.id);
      add(got === want, `Sau 1 xung CLK: ${label} (đo được Q = ${got})`);
    }
    return { ok: lines.every((l) => l.ok), lines };
  }

  // counter
  const ffs = c.components.filter((x) => x.kind === 'ff');
  const labelled = ffs.filter((f) => /^FF\d+$/i.test(f.label ?? ''));
  add(labelled.length === check.bits, `Có ${check.bits} flip-flop tên FF0…FF${check.bits - 1} (đang có ${labelled.length})`);
  if (check.ffType) add(ffs.length > 0 && ffs.every((f) => (f.ffType ?? 'D') === check.ffType), `Tất cả là ${check.ffType}-FF`);
  if (check.edge) {
    const sym = check.edge === 'rising' ? '↑' : '↓';
    add(ffs.length > 0 && ffs.every((f) => (f.edge ?? 'rising') === check.edge), `Tất cả FF kích cạnh ${sym}`);
  }
  const clocks = c.components.filter((x) => x.kind === 'clock');
  if (!clocks.length) {
    add(false, 'Chưa có máy phát xung CLK');
    return { ok: false, lines };
  }
  for (const k of clocks) k.freq = 5;
  const sim = new LiveSimulator(c);
  sim.clockRunning = true;
  if (check.sync) {
    const cc = sim.compiled;
    const clkNet = cc.mainClock?.net;
    add(cc.ffs.length > 0 && cc.ffs.every((f) => f.clk === clkNet), 'Đồng bộ: mọi FF nhận CHUNG một xung CLK');
  }
  for (let i = 0; i < 3200; i++) sim.tick();
  const cyc = sim.tracker.cycle();
  const fmt = (v: number) => v.toString(2).padStart(check.bits, '0');
  const got = cyc.closed ? cyc.states : [];
  let match = false;
  if (got.length === check.expected.length) {
    for (let r = 0; r < got.length && !match; r++) match = check.expected.every((v, i) => got[(i + r) % got.length] === v);
  }
  add(match, `Vòng đếm: ${check.expected.map(fmt).join(' → ')} → ${fmt(check.expected[0])}  ·  đo được: ${got.length ? got.map(fmt).join(' → ') : '(chưa khép vòng)'}`);
  add(cyc.mod === check.expected.length, `MOD = ${check.expected.length} (đo được ${cyc.mod ?? '?'})`);
  return { ok: lines.every((l) => l.ok), lines };
}
