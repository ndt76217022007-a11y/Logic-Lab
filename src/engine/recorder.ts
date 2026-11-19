// Waveform recorder for the timing diagram. One sample per simulation tick.
import type { ClockEdge, Level } from '../types/circuit';
import type { AsyncEvent } from './simulator';

/** 0 = LOW, 1 = HIGH, 2 = floating, 3 = conflict, -1 = not recorded. */
export const levelCode = (l: Level): number => (l === 'L' ? 0 : l === 'H' ? 1 : l === 'Z' ? 2 : 3);
/** Analog samples (capacitor charge / inductor current) are stored as ANALOG_BASE + 0..100 %. */
export const ANALOG_BASE = 100;
export const isAnalog = (code: number) => code >= ANALOG_BASE;

export interface Sample {
  t: number;
  probes: { id: string; code: number }[];
  /** Main clock level (0/1) or -1 when there is no clock. */
  clock: number;
  /** Counter value (FF0 = LSB) or -1. */
  counter: number;
  counterBits: number;
  activeEdge: ClockEdge;
  events: AsyncEvent[];
}

export interface RecordedEvent {
  t: number;
  kind: 'PRE' | 'CLR';
  label: string;
}

export class Recorder {
  capacity = 6000;
  times: number[] = [];
  tracks = new Map<string, number[]>();
  clock: number[] = [];
  counter: number[] = [];
  counterBits = 0;
  activeEdge: ClockEdge = 'rising';
  events: RecordedEvent[] = [];

  get length() {
    return this.times.length;
  }

  push(s: Sample) {
    const idx = this.times.length;
    this.times.push(s.t);
    const seen = new Set<string>();
    for (const p of s.probes) {
      let arr = this.tracks.get(p.id);
      if (!arr) {
        arr = new Array<number>(idx).fill(-1);
        this.tracks.set(p.id, arr);
      }
      arr.push(p.code);
      seen.add(p.id);
    }
    for (const [id, arr] of this.tracks) if (!seen.has(id)) arr.push(-1);
    this.clock.push(s.clock);
    this.counter.push(s.counter);
    this.counterBits = s.counterBits;
    this.activeEdge = s.activeEdge;
    // One marker per kind per tick is enough (several FFs clear together).
    const kinds = new Map<string, string[]>();
    for (const e of s.events) kinds.set(e.kind, [...(kinds.get(e.kind) ?? []), e.label]);
    for (const [kind, labels] of kinds) this.events.push({ t: s.t, kind: kind as 'PRE' | 'CLR', label: labels.join(',') });

    if (this.times.length > this.capacity + 500) {
      const drop = 500;
      this.times.splice(0, drop);
      this.clock.splice(0, drop);
      this.counter.splice(0, drop);
      for (const [id, arr] of this.tracks) {
        arr.splice(0, drop);
        if (arr.every((v) => v === -1)) this.tracks.delete(id);
      }
      const t0 = this.times[0];
      this.events = this.events.filter((e) => e.t >= t0);
    }
  }

  clear() {
    this.times = [];
    this.tracks.clear();
    this.clock = [];
    this.counter = [];
    this.events = [];
  }

  /** Index of the first sample with time >= t (binary search). */
  indexAt(t: number) {
    let lo = 0;
    let hi = this.times.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.times[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
