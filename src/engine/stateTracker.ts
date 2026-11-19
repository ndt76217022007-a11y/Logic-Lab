// Auto-tracks counter states to build a State Transition Diagram.
//
// A state that lasts <= TEMP_TICKS ticks is TEMPORARY. Temporary states that
// were cut short by an asynchronous PRE / CLR (e.g. 111 in a MOD-7 counter)
// are kept as "(111 tạm)" on the transition; ripple transients between two
// stable states (e.g. 011 → 010 → 000 → 100) are ignored.

export const TEMP_TICKS = 3;

export interface Transition {
  from: number;
  to: number;
  /** Temporary states (async-reset glitches) passed on the way. */
  via: number[];
}

export interface CycleInfo {
  /** Stable states in order. */
  states: number[];
  /** via[i] = temporary states between states[i] and states[i+1 (wrapping)]. */
  via: number[][];
  closed: boolean;
  mod: number | null;
  direction: 'UP' | 'DOWN' | 'MIXED' | null;
}

interface Run {
  value: number;
  start: number;
  async: boolean;
  promoted: boolean;
}

export class StateTracker {
  bits = 0;
  private run: Run | null = null;
  private lastStable: number | null = null;
  private pendingVia: number[] = [];
  private next = new Map<number, Transition>();
  history: number[] = [];
  version = 0;

  reset() {
    this.run = null;
    this.lastStable = null;
    this.pendingVia = [];
    this.next.clear();
    this.history = [];
    this.version++;
  }

  update(t: number, value: number, bits: number, asyncActive: boolean) {
    if (bits !== this.bits) {
      this.reset();
      this.bits = bits;
    }
    const run = this.run;
    if (!run) {
      this.run = { value, start: t, async: asyncActive, promoted: false };
      return;
    }
    if (value === run.value) {
      run.async ||= asyncActive;
      if (!run.promoted && t - run.start + 1 > TEMP_TICKS) {
        run.promoted = true;
        this.commitStable(run.value);
      }
      return;
    }
    if (!run.promoted && (run.async || asyncActive)) this.pendingVia.push(run.value);
    this.run = { value, start: t, async: asyncActive, promoted: false };
  }

  private commitStable(v: number) {
    if (this.lastStable === v) {
      this.pendingVia = [];
      return;
    }
    if (this.lastStable !== null) this.next.set(this.lastStable, { from: this.lastStable, to: v, via: [...new Set(this.pendingVia)] });
    this.pendingVia = [];
    this.lastStable = v;
    this.history.push(v);
    if (this.history.length > 64) this.history.shift();
    this.version++;
  }

  get current() {
    return this.lastStable;
  }

  cycle(): CycleInfo {
    const empty: CycleInfo = { states: [], via: [], closed: false, mod: null, direction: null };
    if (this.lastStable === null) return empty;
    // Walk forward from the newest stable state.
    const order: number[] = [this.lastStable];
    const vias: number[][] = [];
    const seen = new Map<number, number>([[this.lastStable, 0]]);
    let cur = this.lastStable;
    for (let i = 0; i <= 1 << Math.max(1, this.bits); i++) {
      const tr = this.next.get(cur);
      if (!tr) break;
      vias.push(tr.via);
      const at = seen.get(tr.to);
      if (at !== undefined) {
        const states = order.slice(at);
        const via = vias.slice(at);
        return { states, via, closed: true, mod: states.length, direction: direction(states, this.bits) };
      }
      seen.set(tr.to, order.length);
      order.push(tr.to);
      cur = tr.to;
    }
    // Not closed yet: show the recent history instead.
    const hist = this.history.slice(-8);
    return { states: hist, via: hist.map(() => []), closed: false, mod: null, direction: direction(hist, this.bits, false) };
  }
}

function direction(states: number[], bits: number, wrap = true): CycleInfo['direction'] {
  if (states.length < 2) return null;
  const m = 1 << bits;
  let up = 0;
  let down = 0;
  const n = wrap ? states.length : states.length - 1;
  for (let i = 0; i < n; i++) {
    const d = (((states[(i + 1) % states.length] - states[i]) % m) + m) % m;
    if (d === 1) up++;
    else if (d === m - 1) down++;
  }
  if (up > down && up >= n / 2) return 'UP';
  if (down > up && down >= n / 2) return 'DOWN';
  return 'MIXED';
}

export const toBits = (v: number, bits: number) => v.toString(2).padStart(bits, '0');
