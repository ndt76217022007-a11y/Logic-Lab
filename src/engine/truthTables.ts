// Truth / characteristic tables for the Analysis panel (live-highlighted).
import type { CircuitComponent } from '../types/circuit';
import { ffDataPins, gateInputCount } from './componentDefs';
import { evalGate } from './simulator';

export interface TTRow {
  cells: string[];
  next: string;
  note: string;
  match: boolean;
}
export interface TruthTableView {
  title: string;
  headers: string[];
  rows: TTRow[];
  footnote?: string;
}

export interface FFLive {
  pre: boolean; // active?
  clr: boolean;
  a: boolean;
  b: boolean;
}

const OVER = '̄'; // combining macron → PRĒ, CLR̄

export function asyncLabel(name: 'PRE' | 'CLR', activeLow: boolean) {
  return activeLow ? `${name.slice(0, 2)}${name[2]}${OVER}` : name;
}

export function ffTruthTable(ff: CircuitComponent, live: FFLive | null): TruthTableView {
  const type = ff.ffType ?? 'D';
  const lowAct = ff.asyncActiveLow ?? true;
  const act = lowAct ? '0' : '1';
  const ina = lowAct ? '1' : '0';
  const edge = (ff.edge ?? 'rising') === 'rising' ? '↑' : '↓';
  const [a, b] = ffDataPins(type);
  const headers = [asyncLabel('PRE', lowAct), asyncLabel('CLR', lowAct), 'CLK', a, ...(b ? [b] : []), 'Q⁺'];
  const anyAsync = !!live && (live.pre || live.clr);
  const x = b ? ['x', 'x'] : ['x'];
  const rows: TTRow[] = [
    { cells: [act, ina, 'x', ...x], next: '1', note: 'async preset', match: !!live && live.pre && !live.clr },
    { cells: [ina, act, 'x', ...x], next: '0', note: 'async clear', match: !!live && !live.pre && live.clr },
    { cells: [act, act, 'x', ...x], next: '1*', note: 'invalid (Q = Q̄ = 1)', match: !!live && live.pre && live.clr },
  ];
  const sync = (ins: number[], next: string, note: string) =>
    rows.push({
      cells: [ina, ina, edge, ...ins.map(String)],
      next,
      note,
      match: !!live && !anyAsync && ins[0] === +live.a && (ins.length < 2 || ins[1] === +live.b),
    });
  switch (type) {
    case 'D':
      sync([0], '0', 'reset');
      sync([1], '1', 'set');
      break;
    case 'T':
      sync([0], 'Q', 'hold');
      sync([1], 'Q̄', 'toggle');
      break;
    case 'JK':
      sync([0, 0], 'Q', 'hold');
      sync([0, 1], '0', 'reset');
      sync([1, 0], '1', 'set');
      sync([1, 1], 'Q̄', 'toggle');
      break;
    case 'SR':
      sync([0, 0], 'Q', 'hold');
      sync([0, 1], '0', 'reset');
      sync([1, 0], '1', 'set');
      sync([1, 1], '?', 'invalid');
      break;
  }
  rows.push({ cells: [ina, ina, edge === '↑' ? '0,1,↓' : '0,1,↑', ...x], next: 'Q', note: 'no active edge', match: false });
  return {
    title: `${type} flip-flop · ${edge === '↑' ? 'rising' : 'falling'} edge · async active-${lowAct ? 'LOW' : 'HIGH'}`,
    headers,
    rows,
    footnote: 'Highlighted: the row that applies now (sync rows apply on the next active edge).',
  };
}

export function gateTruthTable(g: CircuitComponent, liveInputs: boolean[] | null): TruthTableView {
  const n = gateInputCount(g);
  const type = g.gateType ?? 'AND';
  const names = Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
  const rows: TTRow[] = [];
  for (let m = 0; m < 1 << n; m++) {
    const v = names.map((_, i) => !!((m >> (n - 1 - i)) & 1));
    rows.push({
      cells: v.map((b) => (b ? '1' : '0')),
      next: evalGate(type, v) ? '1' : '0',
      note: '',
      match: !!liveInputs && liveInputs.every((b, i) => b === v[i]),
    });
  }
  return { title: `${type}${n > 2 ? n : ''} gate`, headers: [...names, 'Y'], rows };
}
