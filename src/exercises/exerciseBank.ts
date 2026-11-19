// Ngân hàng bài tập — bám sát "GIÁO ÁN ÔN TẬP KỸ THUẬT SỐ" (Phần A, Phần B).
// Phần C (bộ đếm đồng bộ) là phần mở rộng đề xuất thêm, dùng bảng kích của mục A.5.
// Mọi đáp án giản đồ xung và bảng kích được TÍNH bằng engine (không gõ tay).
import type { ClockEdge, FFType } from '../types/circuit';
import type { Exercise, Question, WaveTask } from './types';
import {
  activeEdges,
  clockBits,
  cycleOf,
  downNext,
  excite,
  perEdge,
  pulses,
  simulateCounterWave,
  simulateFFWave,
  upNext,
  type FFWaveSpec,
} from './waveEngine';
import { starterCounter, starterDToJk, starterLatch } from '../lessons/sequentialPresets';

const b3 = (v: number) => v.toString(2).padStart(3, '0');
const ch = (prompt: string, options: string[], answer: number, explain?: string): Question => ({ kind: 'choice', prompt, options, answer, explain });
const num = (prompt: string, answer: number, unit?: string, explain?: string): Question => ({ kind: 'number', prompt, answer, unit, explain });

// ------------------------------------------------------------------ waveform builders
function ffWave(spec: FFWaveSpec, names: { a: string; b?: string }): WaveTask {
  const r = simulateFFWave(spec);
  const low = spec.asyncActiveLow;
  const inputs = [
    { name: 'CLK', bits: spec.clk },
    { name: names.a, bits: spec.a },
    ...(spec.b && names.b ? [{ name: names.b, bits: spec.b }] : []),
    ...(spec.pre ? [{ name: low ? 'PRĒ' : 'PRE', bits: spec.pre }] : []),
    ...(spec.clr ? [{ name: low ? 'CLR̄' : 'CLR', bits: spec.clr }] : []),
  ];
  return {
    inputs,
    answers: [{ name: 'Q', bits: r.q }],
    edges: r.edges,
    edgeDir: spec.edge,
    events: r.events,
    initNote: `Trạng thái ban đầu Q = ${spec.initQ}. CLK kích cạnh ${spec.edge === 'rising' ? 'lên ↑' : 'xuống ↓'}; PRE/CLR tích cực mức ${low ? 'THẤP' : 'CAO'}.`,
    rule: FF_RULE[spec.ff] + ` · Ưu tiên: ${low ? 'PRĒ = 0' : 'PRE = 1'} → Q = 1, ${low ? 'CLR̄ = 0' : 'CLR = 1'} → Q = 0 ngay lập tức.`,
  };
}

const FF_RULE: Record<FFType, string> = {
  SR: 'SR: 00 giữ · 10 Set (Q=1) · 01 Reset (Q=0) · 11 cấm',
  JK: 'JK: 00 giữ · 10 Set · 01 Reset · 11 đảo trạng thái',
  D: 'D: Q(n+1) = D tại cạnh tích cực',
  T: 'T: T = 0 giữ · T = 1 đảo trạng thái',
};

function counterWave(o: {
  edge: ClockEdge;
  up: boolean;
  init: number;
  temp?: number;
  resetTo?: number;
  next?: (s: number) => number;
  sync?: boolean;
  slots?: number;
}): WaveTask {
  const r = simulateCounterWave({
    bits: 3,
    slots: o.slots ?? 40,
    half: 2,
    edge: o.edge,
    init: o.init,
    next: o.next ?? (o.up ? upNext(3) : downNext(3)),
    temp: o.temp,
    resetTo: o.resetTo,
    sync: o.sync,
  });
  return {
    inputs: [{ name: 'CLK', bits: r.clk }],
    answers: r.tracks.map((bits, i) => ({ name: `Q${i}`, bits })),
    edges: r.edges,
    edgeDir: o.edge,
    events: r.events,
    spikes: r.spikes,
    counterBits: 3,
    initNote: `Ban đầu Q2Q1Q0 = ${b3(o.init)}. Vẽ Q0, Q1, Q2 (bỏ qua trễ lan truyền; trạng thái tạm hiện ở đáp án dưới dạng xung nhọn đỏ).`,
    rule: o.sync
      ? 'Đồng bộ: mọi bit đổi CÙNG lúc tại cạnh CLK, theo trạng thái kế tiếp trong chu trình.'
      : `Q0 đổi tại mỗi cạnh ${o.edge === 'rising' ? '↑' : '↓'} của CLK; Q1 đổi theo Q${o.up === (o.edge === 'falling') ? '0' : '̄0'} của tầng trước, Q2 theo tầng 1 → ${o.up ? 'đếm thuận' : 'đếm ngược'}.${o.temp !== undefined ? ` Gặp trạng thái tạm ${b3(o.temp)} → về ${b3(o.resetTo ?? 0)} ngay.` : ''}`,
  };
}

const CLK32 = clockBits(32, 2);
const RISE32 = activeEdges(CLK32, 'rising'); // 2, 6, …, 30
const FALL32 = activeEdges(CLK32, 'falling'); // 4, 8, …, 28

function excitationRows(ff: FFType) {
  return [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ].map(([q, qn]) => ({ label: `${q} → ${qn}`, cells: excite(ff, q, qn) }));
}

/** Cells question: next state + J/K of each FF for a synchronous JK design. */
function syncDesignCells(seq: number[]): Question {
  const rows = seq.map((s, i) => {
    const nx = seq[(i + 1) % seq.length];
    const cells = [b3(nx)];
    for (const bit of [2, 1, 0]) cells.push(...excite('JK', (s >> bit) & 1, (nx >> bit) & 1));
    return { label: b3(s), cells };
  });
  return {
    kind: 'cells',
    prompt: 'Điền bảng trạng thái và bảng kích JK (dùng X cho tùy định):',
    columns: ['Q2Q1Q0 ⁺', 'J2', 'K2', 'J1', 'K1', 'J0', 'K0'],
    rows,
    explain: 'Mỗi cột J/K tra từ bảng kích JK: 0→0 = 0X, 0→1 = 1X, 1→0 = X1, 1→1 = X0.',
  };
}

const MOD8_UP = cycleOf(0, upNext(3));
const MOD8_DOWN = cycleOf(7, downNext(3));
const MOD7 = cycleOf(0, upNext(3), 7, 0);
const MOD5 = cycleOf(0, upNext(3), 5, 0);
const MOD6_UP = cycleOf(0, upNext(3), 6, 0);
const MOD6_DOWN = cycleOf(7, downNext(3), 1, 7);
const MOD5_DOWN = cycleOf(7, downNext(3), 2, 7);
const seqText = (s: number[], temp?: number, reset?: number) =>
  `${s.map(b3).join(' → ')}${temp !== undefined ? ` → (${b3(temp)} tạm)` : ''} → ${b3(reset ?? s[0])}`;

// ------------------------------------------------------------------ bank
export const EXERCISES: Exercise[] = [
  // ================================================================ PHẦN A
  {
    id: 'A1',
    part: 'A',
    level: 'co-ban',
    title: 'Mạch chốt NAND & NOR',
    source: 'Giáo án A.1 · Mạch chốt cơ bản',
    prompt: ['Trả lời các câu hỏi về bảng chân trị của mạch chốt SR dùng 2 cổng NAND và 2 cổng NOR mắc chéo.'],
    questions: [
      ch('Mạch chốt NAND: ngõ vào S, R tích cực ở mức nào?', ['Mức 0 (thấp)', 'Mức 1 (cao)', 'Cạnh lên', 'Cạnh xuống'], 0),
      ch('Chốt NAND, S=0, R=1 →', ['Set (Q = 1)', 'Reset (Q = 0)', 'Không đổi', 'Không dùng'], 0),
      ch('Chốt NAND, S=1, R=0 →', ['Set (Q = 1)', 'Reset (Q = 0)', 'Không đổi', 'Không dùng'], 1),
      ch('Chốt NAND, S=1, R=1 →', ['Set', 'Reset', 'Không đổi (giữ nguyên)', 'Không dùng'], 2),
      ch('Chốt NAND, S=0, R=0 →', ['Set', 'Reset', 'Không đổi', 'Không dùng (Q = 1, Q̄ = 1)'], 3),
      ch('Mạch chốt NOR: ngõ vào S, R tích cực ở mức nào?', ['Mức 0', 'Mức 1'], 1),
      ch('Chốt NOR, S=1, R=1 →', ['Set', 'Reset', 'Không đổi', 'Không dùng'], 3),
      ch('Chốt NOR, S=0, R=1 →', ['Set (Q = 1)', 'Reset (Q = 0)', 'Không đổi', 'Không dùng'], 1),
    ],
    answer: [
      'Chốt NAND (tích cực mức 0): S=0,R=0 không dùng (Q=Q̄=1) · S=0,R=1 Set · S=1,R=0 Reset · S=1,R=1 không đổi.',
      'Chốt NOR (tích cực mức 1): S=0,R=0 không đổi · S=0,R=1 Reset · S=1,R=0 Set · S=1,R=1 không dùng.',
    ],
  },
  {
    id: 'A2',
    part: 'A',
    level: 'co-ban',
    title: 'Thực hành: lắp chốt SR bằng 2 cổng NAND',
    source: 'Giáo án A.1 · thực hành trên mạch',
    prompt: [
      'Trên bảng mạch khởi đầu có 2 công tắc S̄, R̄ và 2 đèn Q, Q̄. Thêm 2 cổng NAND và nối mắc chéo: NAND1(S̄, Q̄) → Q, NAND2(R̄, Q) → Q̄.',
      'Bấm “Kiểm tra mạch” để máy tự thử 4 trạng thái Set / Giữ / Reset / Giữ.',
    ],
    build: { check: { kind: 'latch', gate: 'NAND' }, starter: () => starterLatch('NAND'), solutionPreset: 'sr', hint: 'Đầu ra mỗi cổng nối vào một ngõ vào của cổng kia.' },
    answer: ['Q = NAND(S̄, Q̄), Q̄ = NAND(R̄, Q). Xem mạch mẫu “Chốt SR (2× NAND)”.'],
  },
  {
    id: 'A3',
    part: 'A',
    level: 'co-ban',
    title: 'Thực hành: lắp chốt SR bằng 2 cổng NOR',
    source: 'Giáo án A.1 · Đề xuất bổ sung (thực hành chốt NOR)',
    extra: true,
    prompt: [
      'Lắp chốt SR tích cực mức 1 bằng 2 cổng NOR: Q = NOR(R, Q̄), Q̄ = NOR(S, Q). Chú ý: với chốt NOR, ngõ R đi vào cổng tạo ra Q.',
    ],
    build: { check: { kind: 'latch', gate: 'NOR' }, starter: () => starterLatch('NOR'), solutionPreset: 'sr-nor', hint: 'Ngược với chốt NAND: R vào cổng của Q.' },
    answer: ['Q = NOR(R, Q̄), Q̄ = NOR(S, Q). S=1 → Q̄ = 0 → Q = 1 (Set); R=1 → Q = 0 (Reset).'],
  },
  {
    id: 'A4',
    part: 'A',
    level: 'co-ban',
    title: 'Xung số & xung Clock',
    source: 'Giáo án A.2 · Xung số & Xung Clock (bài tập mẫu f = 10 Hz)',
    prompt: ['Chu kỳ T = t_cao + t_thấp, tần số f = 1/T. Khi t_cao = t_thấp ta có xung vuông.'],
    questions: [
      num('Xung clock vuông f = 10 Hz. Chu kỳ T = ? (ms)', 100, 'ms', 'T = 1/f = 1/10 = 0.1 s = 100 ms'),
      num('Với xung vuông 10 Hz ở trên, t_cao = ? (ms)', 50, 'ms', 't_cao = t_thấp = T/2 = 50 ms'),
      num('(Đề xuất) Xung vuông f = 2 Hz có T = ? (ms)', 500, 'ms', 'T = 1/2 = 0.5 s'),
      num('(Đề xuất) t_cao = 30 ms, t_thấp = 20 ms. Tần số f = ? (Hz)', 20, 'Hz', 'T = 50 ms → f = 1/0.05 = 20 Hz (không phải xung vuông)'),
      ch('Xung “âm” là xung', ['Tích cực mức 0', 'Tích cực mức 1', 'Có tần số âm', 'Chỉ có cạnh lên'], 0),
    ],
    answer: ['f = 10 Hz → T = 0.1 s = 100 ms, t_cao = t_thấp = 50 ms. Mở mạch có CLK, chọn CLK → Inspector đặt 10 Hz để quan sát trên giản đồ xung.'],
  },
  {
    id: 'A5',
    part: 'A',
    level: 'co-ban',
    title: 'Ngõ vào bất đồng bộ PRE / CLR & quy tắc ưu tiên',
    source: 'Giáo án A.3 · Các loại FF & ngõ vào bất đồng bộ',
    prompt: ['Mỗi FF có 4 biến thể: CLK ↑ hoặc ↓ (có vòng tròn), PRE/CLR tích cực mức thấp (vòng tròn + gạch đầu) hoặc mức cao.'],
    questions: [
      ch('Khi PRĒ tích cực, ngõ ra Q', ['Lên 1 ngay lập tức, bất chấp CLK và ngõ vào đồng bộ', 'Lên 1 ở cạnh CLK kế tiếp', 'Về 0 ngay', 'Không đổi'], 0),
      ch('Chân CLR̄ có vòng tròn nghĩa là', ['Tích cực mức thấp (CLR̄ = 0 thì xóa Q = 0)', 'Tích cực mức cao', 'Kích cạnh xuống', 'Không dùng'], 0),
      ch('Ký hiệu vòng tròn ở chân CLK nghĩa là', ['Kích cạnh xuống ↓', 'Kích cạnh lên ↑', 'Tích cực mức thấp', 'Chia tần số'], 0),
      ch('PRE và CLR cùng tích cực một lúc', ['Là trạng thái cấm / không dùng', 'Q = 1', 'Q = 0', 'Q đảo trạng thái'], 0),
      ch('Trọng tâm thi phần Flip-Flop là', ['JK-FF và D-FF', 'SR-FF và T-FF', 'Chỉ mạch chốt', 'Chỉ T-FF'], 0),
    ],
    answer: ['PRE → Q = 1, CLR → Q = 0, tác động NGAY không cần CLK, ưu tiên hơn ngõ vào đồng bộ. Không cho PRE và CLR cùng tích cực.'],
  },
  {
    id: 'A6',
    part: 'A',
    level: 'trung-binh',
    title: 'Vẽ xung 1 — SR-FF (CLK ↑, PRĒ/CLR̄ mức thấp)',
    source: 'Giáo án A.4 · Bài tập vẽ xung 1',
    prompt: [
      'Cho CLK, S, R, PRĒ, CLR̄ như hình. Vẽ ngõ ra Q theo quy trình 3 bước: (1) xác định cạnh tích cực của CLK và điểm tích cực của PRĒ/CLR̄ → (2) kẻ đường gióng nét đứt → (3) tra bảng chân trị.',
    ],
    wave: ffWave(
      {
        ff: 'SR',
        edge: 'rising',
        asyncActiveLow: true,
        initQ: 0,
        clk: CLK32,
        a: perEdge([1, 0, 0, 0, 0, 1, 0, 1], RISE32, 32),
        b: perEdge([0, 0, 1, 0, 1, 0, 0, 0], RISE32, 32),
        pre: pulses(32, 1, [[11, 12]], 0),
        clr: pulses(32, 1, [[23, 24]], 0),
      },
      { a: 'S', b: 'R' },
    ),
    answer: ['Xem danh sách từng mốc thời gian bên dưới giản đồ (đáp án sinh tự động theo bảng chân trị SR-FF).'],
  },
  {
    id: 'A7',
    part: 'A',
    level: 'trung-binh',
    title: 'Vẽ xung 2 — JK-FF (CLK ↑, PRĒ/CLR̄ mức thấp)',
    source: 'Giáo án A.4 · Bài tập vẽ xung 2',
    prompt: ['Đủ 4 tổ hợp JK: 00 (giữ), 10 (Set), 01 (Reset), 11 (đảo), xen giữa có xung PRĒ = 0 và CLR̄ = 0. Vẽ Q.'],
    wave: ffWave(
      {
        ff: 'JK',
        edge: 'rising',
        asyncActiveLow: true,
        initQ: 0,
        clk: CLK32,
        a: perEdge([1, 0, 1, 0, 1, 1, 0, 0], RISE32, 32),
        b: perEdge([0, 0, 1, 1, 1, 1, 0, 1], RISE32, 32),
        pre: pulses(32, 1, [[11, 12]], 0),
        clr: pulses(32, 1, [[19, 20]], 0),
      },
      { a: 'J', b: 'K' },
    ),
    answer: ['JK = 11 tại cạnh ↑ thì Q đảo; PRĒ/CLR̄ tác động ngay giữa chu kỳ rồi Q giữ đến cạnh kế tiếp.'],
  },
  {
    id: 'A8',
    part: 'A',
    level: 'trung-binh',
    title: 'Vẽ xung 3 — D-FF (CLK ↓, PRĒ/CLR̄ mức thấp)',
    source: 'Giáo án A.4 · Bài tập vẽ xung 3',
    prompt: ['Tại mỗi cạnh XUỐNG: Q = D. Khi CLR̄ = 0 thì Q về 0 ngay; khi PRĒ = 0 thì Q lên 1 ngay.'],
    wave: ffWave(
      {
        ff: 'D',
        edge: 'falling',
        asyncActiveLow: true,
        initQ: 0,
        clk: CLK32,
        a: perEdge([1, 1, 0, 0, 1, 0, 1], FALL32, 32),
        pre: pulses(32, 1, [[13, 14]], 0),
        clr: pulses(32, 1, [[5, 6]], 0),
      },
      { a: 'D' },
    ),
    answer: ['Chỉ đọc D tại cạnh ↓ (cạnh lên bỏ qua). CLR̄ ở mốc 5 và PRĒ ở mốc 13 làm Q đổi ngay không chờ CLK.'],
  },
  {
    id: 'A9',
    part: 'A',
    level: 'trung-binh',
    title: 'Vẽ xung — T-FF (CLK ↓)',
    source: 'Đề xuất bổ sung · củng cố chế độ đảo dùng trong bộ đếm',
    extra: true,
    prompt: ['T = 1 tại cạnh ↓ thì Q đảo, T = 0 thì giữ. Có một xung CLR̄ = 0.'],
    wave: ffWave(
      {
        ff: 'T',
        edge: 'falling',
        asyncActiveLow: true,
        initQ: 0,
        clk: CLK32,
        a: perEdge([1, 1, 0, 1, 0, 1, 1], FALL32, 32),
        clr: pulses(32, 1, [[17, 18]], 0),
      },
      { a: 'T' },
    ),
    answer: ['T-FF với T = 1 chính là “chế độ đảo liên tục” — nền tảng của bộ đếm (JK với J=K=1, D với Q̄→D).'],
  },
  {
    id: 'A10',
    part: 'A',
    level: 'nang-cao',
    title: 'Vẽ xung — JK-FF ↓ với PRE/CLR tích cực mức CAO',
    source: 'Đề xuất bổ sung · biến thể cấu hình của Giáo án A.3',
    extra: true,
    prompt: ['Biến thể khó: CLK cạnh xuống và PRE/CLR tích cực mức CAO (không có vòng tròn). Vẽ Q.'],
    wave: ffWave(
      {
        ff: 'JK',
        edge: 'falling',
        asyncActiveLow: false,
        initQ: 0,
        clk: CLK32,
        a: perEdge([1, 1, 0, 1, 0, 1, 1], FALL32, 32),
        b: perEdge([0, 1, 1, 1, 0, 0, 1], FALL32, 32),
        pre: pulses(32, 0, [[9, 10]], 1),
        clr: pulses(32, 0, [[21, 22]], 1),
      },
      { a: 'J', b: 'K' },
    ),
    answer: ['Mức tích cực đảo lại: PRE = 1 mới đặt Q = 1, CLR = 1 mới xóa Q = 0.'],
  },
  {
    id: 'A11',
    part: 'A',
    level: 'trung-binh',
    title: 'Bảng chuyển đổi trạng thái (bảng kích)',
    source: 'Giáo án A.5 · bước (2) lập bảng chuyển đổi Qn → Qn+1',
    prompt: ['Điền bảng kích cho 4 loại FF (dùng X cho tùy định).'],
    questions: [
      { kind: 'cells', prompt: 'SR-FF', columns: ['S', 'R'], rows: excitationRows('SR') },
      { kind: 'cells', prompt: 'JK-FF', columns: ['J', 'K'], rows: excitationRows('JK') },
      { kind: 'cells', prompt: 'D-FF', columns: ['D'], rows: excitationRows('D') },
      { kind: 'cells', prompt: 'T-FF', columns: ['T'], rows: excitationRows('T') },
    ],
    answer: ['JK: 0→0 = 0X, 0→1 = 1X, 1→0 = X1, 1→1 = X0. SR: 0X, 10, 01, X0. D = Qn+1. T = Qn ⊕ Qn+1.'],
  },
  {
    id: 'A12',
    part: 'A',
    level: 'nang-cao',
    title: 'Chuyển đổi D-FF thành JK-FF (bài mẫu trong video)',
    source: 'Giáo án A.5 · Bài tập mẫu 1',
    prompt: ['Quy trình 4 bước: bảng chân trị 2 FF → bảng kích → bìa Karnaugh → vẽ mạch. Tìm biểu thức ngõ vào D theo J, K, Q.'],
    questions: [
      ch('Biểu thức rút gọn của D là', ['D = Q̄·J + Q·K̄', 'D = J + K', 'D = J·Q + K̄·Q̄', 'D = J ⊕ K'], 0, 'Từ bìa K: các ô D = 1 là (Q=0, J=1) và (Q=1, K=0).'),
      num('Số cổng AND cần dùng', 2),
      num('Số cổng NOT cần dùng', 1),
      num('Số cổng OR cần dùng', 1),
      ch('Ngõ ra cổng OR được nối vào', ['Chân D của D-FF', 'Chân CLK', 'Chân PRĒ', 'Chân CLR̄'], 0),
    ],
    answer: ['D = Q̄·J + Q·K̄: 1 NOT tạo K̄, AND1(Q̄, J), AND2(Q, K̄), OR gộp → D. Mở mạch mẫu “D-FF → JK-FF” để kiểm chứng.'],
  },
  {
    id: 'A13',
    part: 'A',
    level: 'nang-cao',
    title: 'Thực hành: lắp mạch D-FF → JK-FF',
    source: 'Giáo án A.5 · bước (4) vẽ mạch logic kết nối',
    prompt: [
      'Bảng mạch khởi đầu có 1 D-FF (↑), công tắc J, K, CLK và đèn Q. Thêm NOT, 2 AND, 1 OR để mạch hoạt động như JK-FF.',
      'Kiểm tra tự động: máy bấm xung CLK với các tổ hợp Reset / Set / Giữ / Đảo / Đảo / Giữ / Reset và đo đèn Q.',
    ],
    build: { check: { kind: 'jk' }, starter: starterDToJk, solutionPreset: 'd2jk', hint: 'Lấy Q và Q̄ từ D-FF quay về các cổng AND.' },
    answer: ['D = Q̄·J + Q·K̄ (xem mạch mẫu “D-FF → JK-FF”).'],
  },
  {
    id: 'A14',
    part: 'A',
    level: 'nang-cao',
    title: 'Tự luyện mở rộng: SR → JK và JK → D',
    source: 'Giáo án A.5 · Bài tập tự luyện mở rộng',
    prompt: ['Áp dụng quy trình 4 bước cho hai phép chuyển đổi còn lại.'],
    questions: [
      ch('Chuyển SR-FF → JK-FF: S = ?, R = ?', ['S = J·Q̄, R = K·Q', 'S = J, R = K', 'S = J·Q, R = K·Q̄', 'S = J + Q, R = K + Q̄'], 0, 'Nhân với Q̄ / Q để không bao giờ có S = R = 1.'),
      ch('Chuyển JK-FF → D-FF: J = ?, K = ?', ['J = D, K = D̄', 'J = D̄, K = D', 'J = K = D', 'J = 1, K = D'], 0),
    ],
    answer: ['SR → JK: S = JQ̄, R = KQ. JK → D: J = D, K = D̄ (thêm 1 cổng NOT).'],
  },

  // ================================================================ PHẦN B
  {
    id: 'B1',
    part: 'B',
    level: 'co-ban',
    title: 'MOD, chế độ đảo & chia tần số',
    source: 'Giáo án B.1 · Khái niệm & quy tắc bộ đếm bất đồng bộ',
    prompt: ['Số MOD = tổng số trạng thái trong 1 chu trình. Với n FF, MOD_max = 2ⁿ (giới hạn thi: tối đa 3 FF).'],
    questions: [
      num('Với 3 FF, MOD_max = ?', 8),
      ch('Chế độ đảo trạng thái liên tục với JK-FF', ['J = K = 1', 'J = K = 0', 'J = 1, K = 0', 'J = 0, K = 1'], 0),
      ch('Chế độ đảo trạng thái liên tục với D-FF', ['Nối Q̄ quay về D', 'Nối Q về D', 'D = 1', 'D = 0'], 0),
      num('f_CLK = 8 kHz. f_Q0 = ? (kHz)', 4, 'kHz', 'Qua 1 tầng chia 2'),
      num('f_CLK = 8 kHz. f_Q1 = ? (kHz)', 2, 'kHz', 'Qua 2 tầng chia 4'),
      num('f_CLK = 8 kHz. f_Q2 = ? (kHz)', 1, 'kHz', 'Qua 3 tầng chia 8'),
    ],
    answer: ['f_Q0 = f/2, f_Q1 = f/4, f_Q2 = f/8. JK: J = K = 1; D: Q̄ → D.'],
  },
  {
    id: 'B2',
    part: 'B',
    level: 'co-ban',
    title: 'Quy tắc chiều đếm (Khác cực = Thuận, Cùng cực = Ngược)',
    source: 'Giáo án B.1 · Quy tắc chiều đếm',
    prompt: ['Cạnh ↓ và ngõ Q “khác cực” nhau? Hãy xác định chiều đếm cho từng cách nối.'],
    questions: [
      ch('CLK cạnh xuống + nối Q vào CLK tầng sau', ['Đếm thuận (lên)', 'Đếm ngược (xuống)'], 0),
      ch('CLK cạnh lên + nối Q̄ vào CLK tầng sau', ['Đếm thuận (lên)', 'Đếm ngược (xuống)'], 0),
      ch('CLK cạnh lên + nối Q vào CLK tầng sau', ['Đếm thuận (lên)', 'Đếm ngược (xuống)'], 1),
      ch('CLK cạnh xuống + nối Q̄ vào CLK tầng sau', ['Đếm thuận (lên)', 'Đếm ngược (xuống)'], 1),
    ],
    answer: ['Thuận: ↓ + Q hoặc ↑ + Q̄. Ngược: ↑ + Q hoặc ↓ + Q̄.'],
  },
  {
    id: 'B3',
    part: 'B',
    level: 'co-ban',
    title: 'Bài 1 — Đếm thuận bất đồng bộ MOD-8 (3 JK-FF, CLK ↓, nối Q)',
    source: 'Giáo án B.3 · Bài 1 (Cơ bản)',
    prompt: ['3 JK-FF, J = K = 1, CLK cạnh xuống, Q nối sang CLK tầng kế tiếp. Vẽ giản đồ xung Q0, Q1, Q2 và sơ đồ trạng thái.'],
    questions: [{ kind: 'seq', prompt: 'Sơ đồ trạng thái Q2Q1Q0 (bắt đầu từ 000):', bits: 3, answer: MOD8_UP }],
    wave: counterWave({ edge: 'falling', up: true, init: 0 }),
    build: {
      check: { kind: 'counter', bits: 3, expected: MOD8_UP, ffType: 'JK', edge: 'falling' },
      starter: () => starterCounter('JK', 'falling', 3, 'BÀI 1 · MOD-8 THUẬN'),
      solutionPreset: 'mod8',
      hint: 'J = K = 1 (nối VCC). CLK chính → FF0; Q0 → CLK FF1; Q1 → CLK FF2.',
    },
    answer: [seqText(MOD8_UP), 'Q0 đổi ở mỗi cạnh ↓ của CLK; Q1 đổi ở mỗi cạnh ↓ của Q0; Q2 đổi ở mỗi cạnh ↓ của Q1.'],
  },
  {
    id: 'B4',
    part: 'B',
    level: 'co-ban',
    title: 'Bài 2 — Đếm ngược bất đồng bộ MOD-8 (3 JK-FF, CLK ↑, nối Q)',
    source: 'Giáo án B.3 · Bài 2 (Cơ bản)',
    prompt: ['3 JK-FF, J = K = 1, CLK cạnh lên, Q nối sang CLK tầng kế tiếp (cùng cực → đếm ngược).'],
    questions: [{ kind: 'seq', prompt: 'Sơ đồ trạng thái (bắt đầu từ 111):', bits: 3, answer: MOD8_DOWN }],
    wave: counterWave({ edge: 'rising', up: false, init: 0 }),
    build: {
      check: { kind: 'counter', bits: 3, expected: MOD8_DOWN, ffType: 'JK', edge: 'rising' },
      starter: () => starterCounter('JK', 'rising', 3, 'BÀI 2 · MOD-8 NGƯỢC'),
      solutionPreset: 'mod8down',
      hint: 'Giống Bài 1 nhưng FF kích cạnh ↑.',
    },
    answer: [seqText(MOD8_DOWN), 'Từ 000, cạnh ↑ đầu tiên đưa về 111 rồi đếm lùi.'],
  },
  {
    id: 'B5',
    part: 'B',
    level: 'trung-binh',
    title: 'Bài 3 — Thiết kế đếm thuận MOD-7 bằng 3 D-FF (Đề thi chuẩn)',
    source: 'Giáo án B.3 · Bài 3 (Thiết kế — Đề thi chuẩn)',
    prompt: [
      'Thiết kế mạch đếm thuận bất đồng bộ MOD-7 dùng 3 D-FF (CLK ↑, PRĒ/CLR̄ mức thấp), chu trình 000 → 001 → … → 110 → 000.',
    ],
    questions: [
      ch('Nối ngõ D của mỗi FF', ['Q̄ về D', 'Q về D', 'D = 1', 'D = CLK'], 0),
      ch('Lấy tín hiệu nào làm CLK tầng sau (CLK ↑, đếm thuận)?', ['Q̄', 'Q'], 0),
      ch('Trạng thái tạm là', ['111', '110', '000', '101'], 0),
      ch('Cổng reset', ['NAND 3 ngõ vào (Q2, Q1, Q0) → CLR̄', 'OR 3 ngõ vào → PRĒ', 'AND (Q2, Q1) → CLR̄', 'NOR (Q2, Q1, Q0) → PRĒ'], 0),
      ch('Chân PRĒ (không dùng) nối', ['Lên mức 1', 'Xuống mức 0', 'Vào CLK', 'Vào Q'], 0),
      { kind: 'seq', prompt: 'Vòng đếm (có thể ghi trạng thái tạm trong ngoặc):', bits: 3, answer: MOD7, temp: 7 },
    ],
    wave: counterWave({ edge: 'rising', up: true, init: 0, temp: 7, resetTo: 0 }),
    build: {
      check: { kind: 'counter', bits: 3, expected: MOD7, ffType: 'D', edge: 'rising' },
      starter: () => starterCounter('D', 'rising', 3, 'BÀI 3 · MOD-7 THUẬN (D-FF)'),
      solutionPreset: 'mod7',
      hint: 'Q̄ → D, Q̄ → CLK tầng sau, NAND3(Q2,Q1,Q0) → CLR̄ của cả 3 FF.',
    },
    answer: [
      'Nối Q̄ về D, lấy Q̄ làm CLK tầng sau. Trạng thái tạm 111 → NAND 3 ngõ vào (Q2, Q1, Q0) → CLR̄ tất cả FF; PRĒ để mức 1.',
      seqText(MOD7, 7, 0),
      'Trên giản đồ: tại cạnh thứ 7, Q0 bật lên 1 trong tích tắc (xung nhọn 111) rồi cả 3 bit về 0.',
    ],
  },
  {
    id: 'B6',
    part: 'B',
    level: 'trung-binh',
    title: 'Bài 4a — Đếm thuận MOD-5 (000 → 100)',
    source: 'Giáo án B.3 · Bài 4 · Biến thể 4a',
    prompt: ['Biến thể của Bài 3: đếm thuận từ 000 đến 100.'],
    questions: [
      ch('Trạng thái tạm', ['101', '100', '110', '111'], 0),
      ch('Cổng reset', ['NAND 2 ngõ vào (Q2, Q0) → CLR̄', 'NAND 2 ngõ vào (Q2, Q1) → CLR̄', 'NAND 3 ngõ vào → CLR̄', 'OR (Q2, Q0) → PRĒ'], 0),
      { kind: 'seq', prompt: 'Vòng đếm:', bits: 3, answer: MOD5, temp: 5 },
    ],
    wave: counterWave({ edge: 'rising', up: true, init: 0, temp: 5, resetTo: 0 }),
    build: {
      check: { kind: 'counter', bits: 3, expected: MOD5, ffType: 'D' },
      starter: () => starterCounter('D', 'rising', 3, 'BÀI 4a · MOD-5 THUẬN'),
      solutionPreset: 'mod5',
      hint: 'Chỉ cần các bit = 1 của 101: Q2 và Q0.',
    },
    answer: ['Trạng thái tạm 101 → NAND(Q2, Q0) → CLR̄.', seqText(MOD5, 5, 0)],
  },
  {
    id: 'B7',
    part: 'B',
    level: 'trung-binh',
    title: 'Bài 4b — Đếm thuận MOD-6 (000 → 101)',
    source: 'Giáo án B.3 · Bài 4 · Biến thể 4b',
    prompt: ['Biến thể của Bài 3: đếm thuận từ 000 đến 101.'],
    questions: [
      ch('Trạng thái tạm', ['110', '101', '111', '011'], 0),
      ch('Cổng reset', ['NAND 2 ngõ vào (Q2, Q1) → CLR̄', 'NAND 2 ngõ vào (Q2, Q0) → CLR̄', 'OR (Q2, Q1) → PRĒ', 'NAND 3 ngõ vào → CLR̄'], 0),
      { kind: 'seq', prompt: 'Vòng đếm:', bits: 3, answer: MOD6_UP, temp: 6 },
    ],
    wave: counterWave({ edge: 'rising', up: true, init: 0, temp: 6, resetTo: 0 }),
    build: {
      check: { kind: 'counter', bits: 3, expected: MOD6_UP, ffType: 'D' },
      starter: () => starterCounter('D', 'rising', 3, 'BÀI 4b · MOD-6 THUẬN'),
      solutionPreset: 'mod6up',
      hint: 'Bit = 1 của 110: Q2, Q1.',
    },
    answer: ['Trạng thái tạm 110 → NAND(Q2, Q1) → CLR̄.', seqText(MOD6_UP, 6, 0)],
  },
  {
    id: 'B8',
    part: 'B',
    level: 'nang-cao',
    title: 'Bài 5 — Phân tích mạch: OR(QA, QB) → PRĒ (Đề thi năm trước)',
    source: 'Giáo án B.3 · Bài 5 (Phân tích mạch)',
    prompt: [
      'Cho mạch 3 D-FF (CLK ↑, Q̄ về D, Q nối sang CLK tầng sau → đếm ngược), cổng OR 2 ngõ vào từ QA (= Q2) và QB (= Q1) đưa vào tất cả chân PRĒ (mức thấp).',
      'Yêu cầu: tìm vòng đếm và vẽ giản đồ xung. Bấm “Mở mạch đề bài” để quan sát mạch chạy thật.',
    ],
    questions: [
      ch('Cổng OR ra 0 khi', ['QA = 0 và QB = 0', 'QA = 1 và QB = 1', 'QA ≠ QB', 'Không bao giờ'], 0),
      ch('Trạng thái tạm là', ['001', '000', '010', '011'], 0, 'Đếm ngược tới 001 là trạng thái đầu tiên có QA = QB = 0.'),
      ch('Khi trạng thái tạm xuất hiện, PRĒ kích nạp về', ['111', '000', '110', '001'], 0),
      { kind: 'seq', prompt: 'Vòng đếm (bắt đầu 111):', bits: 3, answer: MOD6_DOWN, temp: 1 },
      num('Số MOD', 6),
    ],
    wave: counterWave({ edge: 'rising', up: false, init: 7, temp: 1, resetTo: 7 }),
    build: {
      check: { kind: 'counter', bits: 3, expected: MOD6_DOWN, ffType: 'D' },
      solutionPreset: 'mod6',
      hint: 'Đây là bài phân tích: mở mạch đề bài rồi bấm Kiểm tra để xác nhận vòng đếm.',
    },
    answer: ['OR ra 0 khi QA = 0, QB = 0 → trạng thái tạm 001 kích PRĒ nạp về 111.', seqText(MOD6_DOWN, 1, 7), 'MOD-6.'],
  },
  {
    id: 'B9',
    part: 'B',
    level: 'nang-cao',
    title: 'Thiết kế đếm ngược MOD-5 (111 → 011) bằng D-FF + OR → PRĒ',
    source: 'Đề xuất bổ sung · áp dụng quy tắc B.2 (đếm ngược)',
    extra: true,
    prompt: ['Đếm ngược từ 111 qua 5 trạng thái. Tìm trạng thái tạm và cổng OR đưa vào PRĒ.'],
    questions: [
      ch('Trạng thái tạm', ['010', '011', '001', '100'], 0),
      ch('Cổng preset (lấy các bit = 0 của trạng thái tạm)', ['OR (Q2, Q0) → PRĒ', 'OR (Q1) → PRĒ', 'NAND (Q2, Q0) → CLR̄', 'OR (Q2, Q1) → PRĒ'], 0),
      { kind: 'seq', prompt: 'Vòng đếm:', bits: 3, answer: MOD5_DOWN, temp: 2 },
    ],
    wave: counterWave({ edge: 'rising', up: false, init: 7, temp: 2, resetTo: 7 }),
    build: {
      check: { kind: 'counter', bits: 3, expected: MOD5_DOWN, ffType: 'D' },
      starter: () => starterCounter('D', 'rising', 3, 'MOD-5 NGƯỢC (D-FF)', 1),
      solutionPreset: 'mod5down',
      hint: 'D-FF ↑ + nối Q → đếm ngược. CLR̄ để mức 1. Khởi động ở 111.',
    },
    answer: ['Trạng thái tạm 010 (bit 0 ở Q2, Q0) → OR(Q2, Q0) → PRĒ.', seqText(MOD5_DOWN, 2, 7)],
  },
  {
    id: 'B10',
    part: 'B',
    level: 'nang-cao',
    title: 'Nhận diện nhanh MOD của mạch cho trước',
    source: 'Đề xuất bổ sung · luyện phản xạ đề thi',
    extra: true,
    prompt: ['Bộ đếm 3 bit bất đồng bộ. Cho cổng reset/preset, tìm MOD.'],
    questions: [
      num('Đếm thuận, NAND(Q1, Q0) → CLR̄. MOD = ?', 3, undefined, 'Trạng thái tạm 011 → vòng 000, 001, 010.'),
      num('Đếm thuận, NAND(Q2, Q1, Q0) → CLR̄. MOD = ?', 7),
      num('Đếm thuận, NAND(Q2) → CLR̄ (cổng 1 ngõ = NOT). MOD = ?', 4),
      num('Đếm ngược, OR(Q2, Q1) → PRĒ. MOD = ?', 6),
      num('Đếm ngược, OR(Q2, Q1, Q0) → PRĒ. MOD = ?', 7, undefined, 'Trạng thái tạm 000 → 111…001.'),
      ch('Muốn dùng JK-FF ↓ để đếm thuận MOD-6, nối thế nào?', ['J=K=1, Q → CLK sau, NAND(Q2,Q1) → CLR̄', 'J=K=1, Q̄ → CLK sau, NAND(Q2,Q1) → CLR̄', 'J=K=0, Q → CLK sau, OR → PRĒ', 'D = Q̄, NAND → CLR̄'], 0),
    ],
    answer: ['Thuận: MOD = giá trị trạng thái tạm. Ngược (từ 111): MOD = 7 − trạng thái tạm.'],
  },

  // ================================================================ PHẦN C — mở rộng
  {
    id: 'C1',
    part: 'C',
    level: 'co-ban',
    title: 'Đồng bộ khác bất đồng bộ thế nào?',
    source: 'Mở rộng Giai đoạn 3 · Bộ đếm đồng bộ',
    extra: true,
    prompt: ['Bộ đếm đồng bộ: mọi FF nhận chung một xung CLK; logic tổ hợp quyết định FF nào lật.'],
    questions: [
      ch('Trong bộ đếm đồng bộ, CLK của các FF', ['Nối chung một nguồn CLK', 'Nối nối tiếp Q → CLK', 'Không cần CLK', 'Nối Q̄ → CLK'], 0),
      ch('Ưu điểm chính so với bất đồng bộ', ['Mọi bit đổi cùng lúc, không có trễ gợn sóng (ripple) và trạng thái tạm', 'Ít cổng logic hơn', 'Không cần FF', 'Đếm được MOD lớn hơn 2ⁿ'], 0),
      ch('MOD-8 thuận bằng JK: J2 = K2 = ?', ['Q1·Q0', 'Q1 + Q0', 'Q0', '1'], 0),
      ch('MOD-8 ngược bằng JK: J1 = K1 = ?', ['Q̄0', 'Q0', 'Q1', '1'], 0),
    ],
    answer: ['Thuận: J0=K0=1, J1=K1=Q0, J2=K2=Q0·Q1. Ngược: thay Q bằng Q̄.'],
  },
  {
    id: 'C2',
    part: 'C',
    level: 'co-ban',
    title: 'Lắp đếm thuận đồng bộ MOD-8 (JK)',
    source: 'Mở rộng Giai đoạn 3',
    extra: true,
    prompt: ['Dùng 3 JK-FF (↑) chung CLK: J0=K0=1, J1=K1=Q0, J2=K2=Q0·Q1 (1 cổng AND). Vẽ giản đồ và lắp mạch.'],
    wave: counterWave({ edge: 'rising', up: true, init: 0, sync: true }),
    build: {
      check: { kind: 'counter', bits: 3, expected: MOD8_UP, ffType: 'JK', sync: true },
      starter: () => starterCounter('JK', 'rising', 3, 'ĐỒNG BỘ MOD-8 THUẬN'),
      solutionPreset: 'sync8up',
      hint: 'Nối CLK vào cả 3 FF. Cần thêm VCC cho J0, K0.',
    },
    answer: [seqText(MOD8_UP), 'Trên giản đồ thật (timing diagram) các bit đổi CÙNG một tick — không có xung gợn như bộ đếm nối tiếp.'],
  },
  {
    id: 'C3',
    part: 'C',
    level: 'trung-binh',
    title: 'Lắp đếm ngược đồng bộ MOD-8 (JK)',
    source: 'Mở rộng Giai đoạn 3',
    extra: true,
    prompt: ['J0=K0=1, J1=K1=Q̄0, J2=K2=Q̄0·Q̄1.'],
    wave: counterWave({ edge: 'rising', up: false, init: 0, sync: true }),
    build: {
      check: { kind: 'counter', bits: 3, expected: MOD8_DOWN, ffType: 'JK', sync: true },
      starter: () => starterCounter('JK', 'rising', 3, 'ĐỒNG BỘ MOD-8 NGƯỢC'),
      solutionPreset: 'sync8down',
      hint: 'Dùng Q̄ thay cho Q trong biểu thức đếm thuận.',
    },
    answer: [seqText(MOD8_DOWN)],
  },
  {
    id: 'C4',
    part: 'C',
    level: 'nang-cao',
    title: 'Thiết kế đếm thuận đồng bộ MOD-6 bằng JK (bảng kích + Karnaugh)',
    source: 'Mở rộng · áp dụng quy trình 4 bước của Giáo án A.5',
    extra: true,
    prompt: ['Chu trình 000 → 001 → 010 → 011 → 100 → 101 → 000. Trạng thái 110, 111 là tùy định (X).'],
    questions: [
      syncDesignCells(MOD6_UP),
      ch('J1 = ?', ['Q0·Q̄2', 'Q0', 'Q1·Q0', '1'], 0),
      ch('K1 = ?', ['Q0', 'Q0·Q̄2', 'Q2', '1'], 0),
      ch('J2 = ?, K2 = ?', ['J2 = Q1·Q0, K2 = Q0', 'J2 = Q0, K2 = Q1', 'J2 = K2 = Q1·Q0', 'J2 = 1, K2 = Q0'], 0),
      { kind: 'seq', prompt: 'Kiểm tra tự khởi động: từ 110 mạch đi qua những trạng thái nào để vào vòng? (ghi 110 → … → 000)', bits: 3, answer: [6, 7, 0], path: true },
    ],
    wave: counterWave({ edge: 'rising', up: true, init: 0, next: (s) => (s + 1) % 6, sync: true }),
    build: {
      check: { kind: 'counter', bits: 3, expected: MOD6_UP, ffType: 'JK', sync: true },
      starter: () => starterCounter('JK', 'rising', 3, 'ĐỒNG BỘ MOD-6 THUẬN'),
      solutionPreset: 'sync6',
      hint: 'J0 = K0 = 1, J1 = Q0·Q̄2, K1 = Q0, J2 = Q1·Q0, K2 = Q0.',
    },
    answer: [
      'J0 = K0 = 1 · J1 = Q0·Q̄2, K1 = Q0 · J2 = Q1·Q0, K2 = Q0.',
      'Tự khởi động: 110 → 111 → 000 (vào lại vòng đếm).',
      'Không có trạng thái tạm nên giản đồ không có xung nhọn.',
    ],
  },
  {
    id: 'C5',
    part: 'C',
    level: 'nang-cao',
    title: 'Thiết kế đếm thuận đồng bộ MOD-5 bằng JK',
    source: 'Mở rộng · áp dụng quy trình 4 bước của Giáo án A.5',
    extra: true,
    prompt: ['Chu trình 000 → 001 → 010 → 011 → 100 → 000. Trạng thái 101, 110, 111 là tùy định.'],
    questions: [
      syncDesignCells(MOD5),
      ch('J0, K0 = ?', ['J0 = Q̄2, K0 = 1', 'J0 = K0 = 1', 'J0 = Q2, K0 = 1', 'J0 = 1, K0 = Q2'], 0),
      ch('J2, K2 = ?', ['J2 = Q1·Q0, K2 = 1', 'J2 = Q1, K2 = Q0', 'J2 = K2 = Q1·Q0', 'J2 = 1, K2 = 1'], 0),
    ],
    wave: counterWave({ edge: 'rising', up: true, init: 0, next: (s) => (s + 1) % 5, sync: true }),
    build: {
      check: { kind: 'counter', bits: 3, expected: MOD5, ffType: 'JK', sync: true },
      starter: () => starterCounter('JK', 'rising', 3, 'ĐỒNG BỘ MOD-5 THUẬN'),
      solutionPreset: 'sync5',
      hint: 'J0 = Q̄2, K0 = 1, J1 = K1 = Q0, J2 = Q1·Q0, K2 = 1.',
    },
    answer: ['J0 = Q̄2, K0 = 1 · J1 = K1 = Q0 · J2 = Q1·Q0, K2 = 1.', 'Tự khởi động: 101 → 010, 110 → 010, 111 → 000.'],
  },
  {
    id: 'C6',
    part: 'C',
    level: 'trung-binh',
    title: 'Đếm đồng bộ MOD-4 bằng D-FF + XOR',
    source: 'Mở rộng · kết hợp bảng kích D (A.5) và cổng XOR',
    extra: true,
    prompt: ['Với D-FF, D = Q(n+1). Đếm thuận 2 bit: Q0 luôn đảo, Q1 đảo khi Q0 = 1.'],
    questions: [
      ch('D0 = ?', ['Q̄0', 'Q0', '1', 'Q1'], 0),
      ch('D1 = ?', ['Q1 ⊕ Q0', 'Q1·Q0', 'Q1 + Q0', 'Q̄1'], 0, 'Q1 đảo khi Q0 = 1: Q1⁺ = Q1 ⊕ Q0.'),
    ],
    build: {
      check: { kind: 'counter', bits: 2, expected: [0, 1, 2, 3], ffType: 'D', sync: true },
      starter: () => starterCounter('D', 'rising', 2, 'ĐỒNG BỘ MOD-4 (D)'),
      solutionPreset: 'sync4d',
      hint: 'XOR nằm trong nhóm CỔNG LOGIC.',
    },
    answer: ['D0 = Q̄0, D1 = Q1 ⊕ Q0. Mở rộng 3 bit: D2 = Q2 ⊕ (Q1·Q0).'],
  },
];
