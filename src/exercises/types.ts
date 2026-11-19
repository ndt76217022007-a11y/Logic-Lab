import type { Circuit, ClockEdge } from '../types/circuit';
import type { BuildCheck } from './checks';
import type { Bits, Spike, WaveEvent } from './waveEngine';

export type ExLevel = 'co-ban' | 'trung-binh' | 'nang-cao';
export const LEVEL_LABEL: Record<ExLevel, string> = { 'co-ban': 'Cơ bản', 'trung-binh': 'Trung bình', 'nang-cao': 'Nâng cao' };

export type Question =
  | { kind: 'choice'; prompt: string; options: string[]; answer: number; explain?: string }
  | { kind: 'number'; prompt: string; answer: number; unit?: string; tol?: number; explain?: string }
  /** State sequence. Cycles are graded rotation-insensitive unless `path` is set. */
  | { kind: 'seq'; prompt: string; bits: number; answer: number[]; temp?: number; path?: boolean; explain?: string }
  | { kind: 'cells'; prompt: string; columns: string[]; rows: { label: string; cells: string[] }[]; explain?: string };

export interface WaveTrack {
  name: string;
  bits: Bits;
}

export interface WaveTask {
  /** Given signals (CLK first). */
  inputs: WaveTrack[];
  /** Signals the student draws; `bits` is the reference answer. */
  answers: WaveTrack[];
  edges: number[];
  edgeDir: ClockEdge;
  events: WaveEvent[];
  spikes?: Spike[];
  initNote: string;
  /** Step-3 lookup rule shown on request. */
  rule: string;
  /** Show the combined counter value under the tracks (answer view). */
  counterBits?: number;
}

export interface BuildTask {
  check: BuildCheck;
  starter?: () => Circuit;
  solutionPreset?: string;
  hint: string;
}

export interface Exercise {
  id: string;
  part: 'A' | 'B' | 'C';
  level: ExLevel;
  title: string;
  /** Where it comes from: the lesson plan section, or "Đề xuất bổ sung". */
  source: string;
  extra?: boolean;
  prompt: string[];
  questions?: Question[];
  wave?: WaveTask;
  build?: BuildTask;
  /** Full worked answer (đáp án). */
  answer: string[];
}

export const PART_TITLE = {
  A: 'Phần A · Flip-Flop',
  B: 'Phần B · Bộ đếm bất đồng bộ',
  C: 'Phần C · Bộ đếm đồng bộ (mở rộng)',
} as const;
