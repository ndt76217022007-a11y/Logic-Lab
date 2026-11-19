// 📖 Tra bảng — docked reference directory (Vietnamese UI).
import { useMemo, useState, type ReactNode } from 'react';
import type { GateType } from '../types/circuit';
import { evalGate } from '../engine/simulator';
import { gateExpression } from '../engine/componentDefs';

interface Props {
  onClose: () => void;
  onLoadPreset: (id: string) => void;
}

type TabId = 'gates' | 'ff' | 'excite' | 'counter';
const TABS: { id: TabId; title: string; short: string }[] = [
  { id: 'gates', title: 'Cổng Logic cơ bản', short: '1 · Cổng Logic' },
  { id: 'ff', title: 'Bảng chân trị Flip-Flop', short: '2 · Flip-Flop' },
  { id: 'excite', title: 'Bảng chuyển đổi trạng thái (Bảng kích)', short: '3 · Bảng kích' },
  { id: 'counter', title: 'Mẹo nhanh Bộ đếm', short: '4 · Bộ đếm' },
];

interface Entry {
  id: string;
  tab: TabId;
  title: string;
  keywords: string;
  render: () => ReactNode;
}

/** Lowercase + strip Vietnamese diacritics so "bang kich" finds "Bảng kích". */
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

// ------------------------------------------------------------------ shared UI
const OV = ({ children }: { children: ReactNode }) => <span style={{ textDecoration: 'overline' }}>{children}</span>;

function Table({
  headers,
  rows,
  active,
  onRow,
  outCols = 1,
  noteCol = false,
}: {
  headers: ReactNode[];
  rows: ReactNode[][];
  active?: number;
  onRow?: (i: number) => void;
  outCols?: number;
  noteCol?: boolean;
}) {
  const nOut = headers.length - outCols - (noteCol ? 1 : 0);
  return (
    <table className="w-full border-collapse text-center font-mono text-[11.5px]">
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th
              key={i}
              className={`border border-edge px-1.5 py-1 ${i >= nOut && i < nOut + outCols ? 'text-glow-amber' : noteCol && i === headers.length - 1 ? 'text-slate-500' : 'text-glow-cyan'}`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr
            key={i}
            onClick={onRow ? () => onRow(i) : undefined}
            className={`${onRow ? 'cursor-pointer hover:bg-[#1b1f38]' : ''} ${active === i ? 'bg-[#2a2410] text-glow-amber' : 'text-slate-200'}`}
          >
            {r.map((c, j) => (
              <td
                key={j}
                className={`border border-edge px-1.5 py-0.5 ${j >= nOut && j < nOut + outCols ? 'font-bold' : ''} ${noteCol && j === r.length - 1 ? 'text-left text-[10.5px] text-slate-400' : ''}`}
              >
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const Note = ({ children }: { children: ReactNode }) => <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{children}</p>;
const Formula = ({ children }: { children: ReactNode }) => (
  <div className="my-1.5 inline-block rounded border border-glow-amber/40 bg-[#2a2410] px-2 py-0.5 font-mono text-[13px] text-glow-amber">{children}</div>
);

// ------------------------------------------------------------------ gate symbols (IEEE/ANSI distinctive shapes)
function GateSymbol({ type }: { type: GateType }) {
  const stroke = '#c9d1ff';
  const isOr = type === 'OR' || type === 'NOR' || type === 'XOR' || type === 'XNOR';
  const inv = type === 'NOT' || type === 'NAND' || type === 'NOR' || type === 'XNOR';
  const tip = type === 'NOT' ? 40 : 44;
  return (
    <svg width={74} height={40} viewBox="0 0 74 40" className="shrink-0">
      <g fill="#12162a" stroke={stroke} strokeWidth={1.6} strokeLinejoin="round">
        {type === 'NOT' ? (
          <>
            <line x1={0} y1={20} x2={14} y2={20} />
            <path d="M14,6 L40,20 L14,34 Z" />
          </>
        ) : (
          <>
            <line x1={0} y1={12} x2={isOr ? 17 : 14} y2={12} />
            <line x1={0} y1={28} x2={isOr ? 17 : 14} y2={28} />
            {isOr ? <path d="M12,5 Q34,5 44,20 Q34,35 12,35 Q20,20 12,5 Z" /> : <path d="M14,5 H29 A15,15 0 0 1 29,35 H14 Z" />}
            {(type === 'XOR' || type === 'XNOR') && <path d="M7,5 Q15,20 7,35" fill="none" />}
          </>
        )}
        {inv && <circle cx={tip + 3.5} cy={20} r={3.2} />}
        <line x1={inv ? tip + 7 : tip} y1={20} x2={74} y2={20} />
      </g>
    </svg>
  );
}

const GATE_INFO: Record<GateType, { vn: string; html: ReactNode; note: string }> = {
  NOT: { vn: 'Cổng ĐẢO', html: <>Y = <OV>A</OV></>, note: 'Đầu ra là phủ định của đầu vào.' },
  AND: { vn: 'Cổng VÀ', html: <>Y = A·B</>, note: 'Y = 1 khi TẤT CẢ đầu vào = 1.' },
  OR: { vn: 'Cổng HOẶC', html: <>Y = A + B</>, note: 'Y = 1 khi CÓ ÍT NHẤT một đầu vào = 1.' },
  NAND: { vn: 'Cổng VÀ-ĐẢO', html: <>Y = <OV>A·B</OV></>, note: 'Y = 0 chỉ khi tất cả đầu vào = 1. Cổng vạn năng.' },
  NOR: { vn: 'Cổng HOẶC-ĐẢO', html: <>Y = <OV>A + B</OV></>, note: 'Y = 1 chỉ khi tất cả đầu vào = 0. Cổng vạn năng.' },
  XOR: { vn: 'Cổng HOẶC LOẠI TRỪ', html: <>Y = A ⊕ B = A<OV>B</OV> + <OV>A</OV>B</>, note: 'Y = 1 khi hai đầu vào KHÁC nhau (số bit 1 lẻ).' },
  XNOR: { vn: 'Cổng ĐỒNG NHẤT (XNOR)', html: <>Y = <OV>A ⊕ B</OV> = AB + <OV>A</OV><OV>B</OV></>, note: 'Y = 1 khi hai đầu vào GIỐNG nhau (số bit 1 chẵn).' },
};

function GateCard({ type }: { type: GateType }) {
  const n = type === 'NOT' ? 1 : 2;
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const combos = Array.from({ length: 1 << n }, (_, m) => (n === 1 ? [m] : [(m >> 1) & 1, m & 1]));
  const active = n === 1 ? a : a * 2 + b;
  const y = evalGate(type, n === 1 ? [!!a] : [!!a, !!b]) ? 1 : 0;
  const info = GATE_INFO[type];
  const bitBtn = (name: string, v: number, set: (v: number) => void) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        set(1 - v);
      }}
      title={`Bấm để đổi ${name}`}
      className={`rounded border px-1.5 ${v ? 'border-glow-amber bg-[#2a2410] text-glow-amber' : 'border-edge bg-ink text-glow-cyan'}`}
    >
      {name}={v}
    </button>
  );
  return (
    <div>
      <div className="flex items-center gap-3">
        <GateSymbol type={type} />
        <div>
          <div className="text-[11px] text-slate-400">{info.vn}</div>
          <Formula>{info.html}</Formula>
        </div>
      </div>
      <div className="mt-1 flex items-start gap-3">
        <div className="flex-1">
          <Table
            headers={[bitBtn('A', a, setA), ...(n === 2 ? [bitBtn('B', b, setB)] : []), 'Y']}
            rows={combos.map((c) => [...c.map(String), String(evalGate(type, c.map(Boolean)) ? 1 : 0)])}
            active={active}
            onRow={(i) => {
              if (n === 1) setA(i);
              else {
                setA((i >> 1) & 1);
                setB(i & 1);
              }
            }}
          />
        </div>
        <div className="flex w-16 flex-col items-center gap-1 pt-1">
          <span
            className={`h-6 w-6 rounded-full ${y ? 'bg-[#ff4d6d] shadow-[0_0_12px_#ff4d6d]' : 'bg-[#3a1626]'}`}
            aria-label={`Y = ${y}`}
          />
          <span className={`font-pixel text-xl ${y ? 'text-glow-amber' : 'text-slate-500'}`}>Y = {y}</span>
        </div>
      </div>
      <Note>
        {info.note}
        {type !== 'NOT' && (
          <>
            {' '}
            Bản 3 đầu vào: <span className="font-mono text-slate-200">{gateExpression(type, 3).text}</span> (dấu &apos; = phủ định). Đổi 2/3/4 chân
            trong Inspector.
          </>
        )}
      </Note>
    </div>
  );
}

// ------------------------------------------------------------------ flip-flop tables
const asyncRows = (cols: number): string[][] => {
  const x = Array.from({ length: cols }, () => 'x');
  return [
    ['0', '1', 'x', ...x, '1', 'Preset bất đồng bộ (ưu tiên cao nhất)'],
    ['1', '0', 'x', ...x, '0', 'Clear bất đồng bộ'],
    ['0', '0', 'x', ...x, '1*', 'Cấm: Q = Q̄ = 1'],
  ];
};
const FF_HEAD = (ins: string[]) => [
  <>PR<OV>E</OV></>,
  <>CL<OV>R</OV></>,
  'CLK',
  ...ins,
  'Q(n+1)',
  'Ghi chú',
];

function FFTable({ ins, sync }: { ins: string[]; sync: string[][] }) {
  const x = ins.map(() => 'x');
  return (
    <Table
      headers={FF_HEAD(ins)}
      rows={[
        ...asyncRows(ins.length),
        ...sync.map((r) => ['1', '1', '↑/↓', ...r]),
        ['1', '1', '0, 1', ...x, 'Q(n)', 'Không có cạnh tích cực → giữ'],
      ]}
      noteCol
    />
  );
}

const EDGE_NOTE = (
  <Note>
    <b className="text-slate-200">↑</b> = kích cạnh lên (Rising) · <b className="text-slate-200">↓</b> = kích cạnh xuống (Falling, có vòng tròn
    nhỏ ở chân CLK). PR<OV>E</OV>/CL<OV>R</OV> tích cực mức THẤP (có vòng tròn): tác động ngay, KHÔNG cần xung CLK, và ưu tiên hơn mọi đầu vào
    đồng bộ. Nếu chọn Active-HIGH thì đảo các giá trị 0/1 ở hai cột này.
  </Note>
);

// ------------------------------------------------------------------ MOD-N calculator
function ModCalculator() {
  const [N, setN] = useState(6);
  const [dir, setDir] = useState<'up' | 'down'>('up');
  const n = Math.max(1, Math.ceil(Math.log2(Math.max(2, N))));
  const full = 1 << n;
  const bits = (v: number) => v.toString(2).padStart(n, '0');
  let body: ReactNode;
  if (N === full) {
    body = <Note>N = 2^{n} → không cần cổng reset, chỉ cần {n} FF nối tiếp.</Note>;
  } else if (dir === 'up') {
    const temp = N;
    const ones = Array.from({ length: n }, (_, i) => i).filter((i) => (temp >> i) & 1).reverse();
    body = (
      <>
        <div className="font-mono text-[12px] text-slate-200">
          Chu trình: {bits(0)} → … → {bits(N - 1)} → <span className="text-glow-red">({bits(temp)} tạm)</span> → {bits(0)}
        </div>
        <Formula>
          CL<OV>R</OV> = <OV>{ones.map((i) => `Q${i}`).join('·')}</OV> → cổng NAND{ones.length > 1 ? ones.length : ''} ({ones.map((i) => `Q${i}`).join(', ')})
        </Formula>
        <Note>Chỉ cần đưa các bit = 1 của trạng thái tạm vào NAND (trạng thái nhỏ hơn N không thể có đủ các bit 1 đó). Nối ra CL<OV>R</OV> của TẤT CẢ FF.</Note>
      </>
    );
  } else {
    const temp = full - 1 - N;
    const zeros = Array.from({ length: n }, (_, i) => i).filter((i) => !((temp >> i) & 1)).reverse();
    body = (
      <>
        <div className="font-mono text-[12px] text-slate-200">
          Chu trình: {bits(full - 1)} → … → {bits(full - N)} → <span className="text-glow-red">({bits(temp)} tạm)</span> → {bits(full - 1)}
        </div>
        <Formula>
          PR<OV>E</OV> = {zeros.map((i) => `Q${i}`).join(' + ')} → cổng OR{zeros.length > 1 ? zeros.length : ''} ({zeros.map((i) => `Q${i}`).join(', ')})
        </Formula>
        <Note>OR = 0 chỉ khi các bit 0 của trạng thái tạm đều = 0. Nối ra PR<OV>E</OV> của TẤT CẢ FF; khởi động ở {bits(full - 1)}.</Note>
      </>
    );
  }
  return (
    <div className="rounded border border-edge bg-[#0f1221] p-2">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
        <label className="flex items-center gap-1">
          MOD N =
          <input
            type="number"
            min={2}
            max={64}
            value={N}
            onChange={(e) => setN(Math.max(2, Math.min(64, Math.round(+e.target.value) || 2)))}
            className="w-14 rounded border border-edge bg-ink px-1 text-glow-amber outline-none"
          />
        </label>
        <div className="flex overflow-hidden rounded border border-edge">
          {(['up', 'down'] as const).map((d) => (
            <button key={d} onClick={() => setDir(d)} className={`px-2 py-0.5 ${dir === d ? 'bg-[#2a2410] text-glow-amber' : 'bg-ink text-slate-400'}`}>
              {d === 'up' ? 'Đếm thuận ▲' : 'Đếm ngược ▼'}
            </button>
          ))}
        </div>
        <span className="text-slate-400">
          → cần <b className="text-slate-200">{n}</b> FF
        </span>
      </div>
      {body}
    </div>
  );
}

// ------------------------------------------------------------------ entries
function buildEntries(onLoadPreset: (id: string) => void): Entry[] {
  const gates: GateType[] = ['NOT', 'AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR'];
  const preset = (id: string, label: string) => (
    <button className="btn mr-1 mt-1 text-[10.5px]" onClick={() => onLoadPreset(id)}>
      ▶ Mở mạch mẫu: {label}
    </button>
  );
  return [
    ...gates.map(
      (g): Entry => ({
        id: `gate-${g}`,
        tab: 'gates',
        title: `${g} — ${GATE_INFO[g].vn}`,
        keywords: `${g} cong logic ${GATE_INFO[g].vn} bang chan tri truth table`,
        render: () => <GateCard type={g} />,
      }),
    ),
    {
      id: 'ff-sr',
      tab: 'ff',
      title: 'SR Flip-Flop',
      keywords: 'sr flip flop set reset bang chan tri',
      render: () => (
        <>
          <FFTable
            ins={['S', 'R']}
            sync={[
              ['0', '0', 'Q(n)', 'Giữ nguyên'],
              ['0', '1', '0', 'Reset'],
              ['1', '0', '1', 'Set'],
              ['1', '1', '?', 'Cấm (không xác định)'],
            ]}
          />
          <Formula>Q(n+1) = S + R̄·Q(n), điều kiện S·R = 0</Formula>
        </>
      ),
    },
    {
      id: 'ff-jk',
      tab: 'ff',
      title: 'JK Flip-Flop',
      keywords: 'jk flip flop toggle lat bang chan tri',
      render: () => (
        <>
          <FFTable
            ins={['J', 'K']}
            sync={[
              ['0', '0', 'Q(n)', 'Giữ nguyên'],
              ['0', '1', '0', 'Reset'],
              ['1', '0', '1', 'Set'],
              ['1', '1', 'Q̄(n)', 'Lật trạng thái (Toggle)'],
            ]}
          />
          <Formula>Q(n+1) = J·Q̄(n) + K̄·Q(n)</Formula>
        </>
      ),
    },
    {
      id: 'ff-d',
      tab: 'ff',
      title: 'D Flip-Flop',
      keywords: 'd flip flop data delay bang chan tri',
      render: () => (
        <>
          <FFTable
            ins={['D']}
            sync={[
              ['0', '0', 'Reset (Q theo D)'],
              ['1', '1', 'Set (Q theo D)'],
            ]}
          />
          <Formula>Q(n+1) = D</Formula>
          <Note>Nối Q̄ → D biến D-FF thành T-FF luôn lật (T = 1) — dùng trong bộ đếm.</Note>
        </>
      ),
    },
    {
      id: 'ff-t',
      tab: 'ff',
      title: 'T Flip-Flop',
      keywords: 't flip flop toggle bang chan tri',
      render: () => (
        <>
          <FFTable
            ins={['T']}
            sync={[
              ['0', 'Q(n)', 'Giữ nguyên'],
              ['1', 'Q̄(n)', 'Lật trạng thái'],
            ]}
          />
          <Formula>Q(n+1) = T ⊕ Q(n)</Formula>
        </>
      ),
    },
    {
      id: 'ff-edge',
      tab: 'ff',
      title: 'Ghi chú: cạnh kích & PRĒ / CLR̄',
      keywords: 'canh len canh xuong rising falling preset clear active low uu tien',
      render: () => EDGE_NOTE,
    },
    {
      id: 'ff-latch',
      tab: 'ff',
      title: 'Chốt SR dùng NAND (S̄, R̄)',
      keywords: 'chot sr latch nand sbar rbar',
      render: () => (
        <>
          <Table
            headers={[<OV key="s">S</OV>, <OV key="r">R</OV>, 'Q', 'Q̄', 'Ghi chú']}
            rows={[
              ['0', '0', '1', '1', 'Cấm'],
              ['0', '1', '1', '0', 'Set'],
              ['1', '0', '0', '1', 'Reset'],
              ['1', '1', 'Q', 'Q̄', 'Giữ (nhớ)'],
            ]}
            outCols={2}
            noteCol
          />
          {preset('sr', 'Chốt SR (2 NAND)')}
        </>
      ),
    },
    {
      id: 'ex-master',
      tab: 'excite',
      title: 'Bảng kích tổng hợp SR · JK · D · T',
      keywords: 'bang kich excitation qn qn+1 chuyen doi trang thai karnaugh',
      render: () => (
        <>
          <Table
            headers={['Q(n)', 'Q(n+1)', 'S', 'R', 'J', 'K', 'D', 'T']}
            rows={[
              ['0', '0', '0', 'X', '0', 'X', '0', '0'],
              ['0', '1', '1', '0', '1', 'X', '1', '1'],
              ['1', '0', '0', '1', 'X', '1', '0', '1'],
              ['1', '1', 'X', '0', 'X', '0', '1', '0'],
            ]}
            outCols={0}
          />
          <Note>X = tùy định (don&apos;t care) — dùng như 0 hoặc 1 để rút gọn bìa Karnaugh.</Note>
          <Table
            headers={['Q(n)→Q(n+1)', 'SR', 'JK', 'D', 'T']}
            rows={[
              ['0 → 0', '0X', '0X', '0', '0'],
              ['0 → 1', '10', '1X', '1', '1'],
              ['1 → 0', '01', 'X1', '0', '1'],
              ['1 → 1', 'X0', 'X0', '1', '0'],
            ]}
            outCols={0}
          />
        </>
      ),
    },
    {
      id: 'ex-eq',
      tab: 'excite',
      title: 'Phương trình đặc trưng',
      keywords: 'phuong trinh dac trung characteristic equation',
      render: () => (
        <div className="flex flex-col items-start">
          <Formula>SR: Q(n+1) = S + R̄·Q(n) (S·R = 0)</Formula>
          <Formula>JK: Q(n+1) = J·Q̄(n) + K̄·Q(n)</Formula>
          <Formula>D: Q(n+1) = D</Formula>
          <Formula>T: Q(n+1) = T ⊕ Q(n)</Formula>
        </div>
      ),
    },
    {
      id: 'ex-convert',
      tab: 'excite',
      title: 'Quy trình chuyển đổi FF / thiết kế bộ đếm đồng bộ',
      keywords: 'chuyen doi flip flop thiet ke dong bo karnaugh quy trinh',
      render: () => (
        <ol className="list-decimal space-y-1 pl-4 text-[11.5px] text-slate-300">
          <li>Lập bảng trạng thái: Q(n) (và đầu vào) → Q(n+1) mong muốn.</li>
          <li>Với mỗi dòng, tra bảng kích để ghi giá trị đầu vào FF cần có (dùng X khi tùy định).</li>
          <li>Vẽ bìa Karnaugh cho từng đầu vào (J, K, D, T…) theo biến Q(n) và đầu vào.</li>
          <li>Rút gọn → biểu thức đầu vào → vẽ mạch bằng cổng logic.</li>
          <li>Ví dụ: JK → D: J = D, K = D̄. D → T: D = T ⊕ Q. JK → T: J = K = T.</li>
        </ol>
      ),
    },
    {
      id: 'cnt-rules',
      tab: 'counter',
      title: 'Bộ đếm không đồng bộ: thuận / ngược',
      keywords: 'bo dem khong dong bo thuan nguoc len xuong up down canh q qbar',
      render: () => (
        <>
          <Table
            headers={['Kiểu đếm', 'CLK của FF', 'Nối vào CLK tầng sau']}
            rows={[
              ['Đếm thuận (Lên) ▲', '↓ cạnh xuống', 'Q'],
              ['Đếm thuận (Lên) ▲', '↑ cạnh lên', 'Q̄'],
              ['Đếm ngược (Xuống) ▼', '↑ cạnh lên', 'Q'],
              ['Đếm ngược (Xuống) ▼', '↓ cạnh xuống', 'Q̄'],
            ]}
            outCols={1}
          />
          <Note>Mỗi FF phải ở chế độ lật: JK với J = K = 1, T với T = 1, hoặc D với Q̄ → D. FF0 (LSB) nhận xung CLK chính.</Note>
          {preset('mod8', 'MOD-8 (JK ↓ + Q)')}
        </>
      ),
    },
    {
      id: 'cnt-mod',
      tab: 'counter',
      title: 'Quy tắc MOD < 2ⁿ (trạng thái tạm)',
      keywords: 'mod n trang thai tam nand clr or pre reset preset glitch',
      render: () => (
        <>
          <Table
            headers={['Kiểu', 'Phát hiện', 'Nối vào', 'Về trạng thái']}
            rows={[
              ['Đếm thuận', 'NAND các bit = 1 của trạng thái N (tạm)', 'CLR̄ mọi FF', '000'],
              ['Đếm ngược', 'OR các bit = 0 của trạng thái tạm', 'PRĒ mọi FF', '111'],
            ]}
            outCols={0}
          />
          <Note>
            Trạng thái tạm chỉ tồn tại vài ns (ở đây 1–2 tick) rồi bị xóa/đặt ngay — trên giản đồ xung thấy là xung hẹp màu đỏ (glitch) và không
            được tính vào MOD. Số FF cần: n = ⌈log₂N⌉. Tần số ra: f = f_CLK / N.
          </Note>
          {preset('mod7', 'MOD-7 thuận (NAND → CLR̄)')}
          {preset('mod6', 'MOD-6 ngược (OR → PRĒ)')}
        </>
      ),
    },
    {
      id: 'cnt-calc',
      tab: 'counter',
      title: 'Máy tính MOD-N nhanh',
      keywords: 'may tinh mod n calculator thiet ke bo dem',
      render: () => <ModCalculator />,
    },
  ];
}

export default function ReferenceDrawer({ onClose, onLoadPreset }: Props) {
  const [tab, setTab] = useState<TabId>('gates');
  const [query, setQuery] = useState('');
  const entries = useMemo(() => buildEntries(onLoadPreset), [onLoadPreset]);
  const q = norm(query.trim());
  const visible = q ? entries.filter((e) => norm(`${e.title} ${e.keywords}`).includes(q)) : entries.filter((e) => e.tab === tab);

  const jump = (e: Entry) => {
    setQuery('');
    setTab(e.tab);
    requestAnimationFrame(() => document.getElementById(`ref-${e.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <aside className="flex w-[min(480px,40vw)] min-w-[340px] shrink-0 flex-col border-l border-edge bg-panel">
      <div className="flex items-center gap-2 border-b border-edge px-3 py-2">
        <span className="font-pixel text-xl tracking-widest text-glow-cyan">📖 TRA BẢNG</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm: JK, bảng kích, MOD…"
          className="min-w-0 flex-1 rounded border border-edge bg-ink px-2 py-1 text-[12px] text-slate-200 outline-none focus:border-glow-cyan"
        />
        <button className="btn px-1.5" onClick={onClose} title="Đóng (B)">
          ✕
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <nav className="scroll-thin w-32 shrink-0 overflow-y-auto border-r border-edge p-2 text-[11px]">
          <div className="mb-1 font-pixel text-base tracking-widest text-slate-500">MỤC LỤC</div>
          {TABS.map((t) => (
            <div key={t.id} className="mb-2">
              <button
                onClick={() => {
                  setQuery('');
                  setTab(t.id);
                }}
                className={`w-full rounded px-1.5 py-1 text-left font-bold ${!q && tab === t.id ? 'bg-[#2a2410] text-glow-amber' : 'text-slate-200 hover:bg-[#1b1f38]'}`}
              >
                {t.short}
              </button>
              {entries
                .filter((e) => e.tab === t.id)
                .map((e) => (
                  <button key={e.id} onClick={() => jump(e)} className="block w-full truncate px-3 py-0.5 text-left text-slate-400 hover:text-glow-cyan">
                    {e.title.split(' — ')[0]}
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <div className="scroll-thin min-w-0 flex-1 overflow-y-auto p-3">
          {!q && <h2 className="mb-3 font-pixel text-2xl tracking-wider text-glow-amber">{TABS.find((t) => t.id === tab)!.title}</h2>}
          {q && (
            <h2 className="mb-3 text-[12px] text-slate-400">
              {visible.length} kết quả cho “{query}”
            </h2>
          )}
          {visible.map((e) => (
            <section key={e.id} id={`ref-${e.id}`} className="mb-4 rounded border border-edge bg-[#12162a] p-3">
              <h3 className="mb-2 font-pixel text-lg tracking-wide text-slate-100">
                {q && <span className="mr-1 text-[11px] text-slate-500">[{TABS.find((t) => t.id === e.tab)!.short}]</span>}
                {e.title}
              </h3>
              {e.render()}
            </section>
          ))}
          {!visible.length && <p className="text-[12px] text-slate-500">Không tìm thấy mục nào.</p>}
        </div>
      </div>
    </aside>
  );
}
