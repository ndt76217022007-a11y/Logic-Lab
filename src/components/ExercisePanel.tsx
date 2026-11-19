// 📝 Bài tập — exercise browser, quizzes, timing-diagram drawing and circuit checks.
import { useEffect, useMemo, useState } from 'react';
import type { Circuit } from '../types/circuit';
import { EXERCISES } from '../exercises/exerciseBank';
import { LEVEL_LABEL, PART_TITLE, type Exercise, type Question } from '../exercises/types';
import { runCheck, type CheckResult } from '../exercises/checks';
import WaveformExercise from './WaveformExercise';

interface Props {
  circuit: Circuit;
  onLoadCircuit: (c: Circuit) => void;
  onLoadPreset: (id: string) => void;
  onClose: () => void;
}

interface Progress {
  quiz?: boolean;
  wave?: number;
  build?: boolean;
}
const STORE = 'logic-lab:exercises:v1';
function loadProgress(): Record<string, Progress> {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, Progress>;
  } catch {
    return {};
  }
}
const isDone = (e: Exercise, p?: Progress) =>
  !!p && (!e.questions || !!p.quiz) && (!e.wave || p.wave === 100) && (!e.build || !!p.build);

const LEVEL_STYLE = {
  'co-ban': 'border-emerald-400/50 text-emerald-300',
  'trung-binh': 'border-glow-amber/60 text-glow-amber',
  'nang-cao': 'border-glow-red/60 text-[#ff8a96]',
} as const;

// ------------------------------------------------------------------ grading
const b = (v: number, n: number) => v.toString(2).padStart(n, '0');
function gradeSeq(q: Extract<Question, { kind: 'seq' }>, text: string) {
  let got = (text.match(new RegExp(`[01]{${q.bits}}`, 'g')) ?? []).map((s) => parseInt(s, 2));
  if (q.temp !== undefined && !q.path) got = got.filter((v) => v !== q.temp);
  if (!q.path && got.length > 1 && got[got.length - 1] === got[0]) got = got.slice(0, -1);
  if (got.length !== q.answer.length) return false;
  if (q.path) return got.every((v, i) => v === q.answer[i]);
  for (let r = 0; r < got.length; r++) if (q.answer.every((v, i) => got[(i + r) % got.length] === v)) return true;
  return false;
}
function grade(q: Question, ans: unknown): boolean {
  switch (q.kind) {
    case 'choice':
      return ans === q.answer;
    case 'number': {
      const v = parseFloat(String(ans ?? '').replace(',', '.'));
      return Number.isFinite(v) && Math.abs(v - q.answer) <= (q.tol ?? 1e-6) * Math.max(1, Math.abs(q.answer));
    }
    case 'seq':
      return gradeSeq(q, String(ans ?? ''));
    case 'cells': {
      const grid = (ans as string[][] | undefined) ?? [];
      return q.rows.every((r, i) => r.cells.every((c, j) => (grid[i]?.[j] ?? '').trim().toUpperCase() === c.toUpperCase()));
    }
  }
}
function answerText(q: Question): string {
  switch (q.kind) {
    case 'choice':
      return q.options[q.answer];
    case 'number':
      return `${q.answer}${q.unit ? ` ${q.unit}` : ''}`;
    case 'seq':
      return q.path ? q.answer.map((v) => b(v, q.bits)).join(' → ') : `${q.answer.map((v) => b(v, q.bits)).join(' → ')} → ${b(q.answer[0], q.bits)}`;
    case 'cells':
      return 'xem bảng (ô xanh)';
  }
}

// ------------------------------------------------------------------ quiz block
function Quiz({ questions, onPass }: { questions: Question[]; onPass: () => void }) {
  const [ans, setAns] = useState<unknown[]>(() => questions.map(() => undefined));
  const [checked, setChecked] = useState(false);
  const [reveal, setReveal] = useState(false);
  const results = questions.map((q, i) => grade(q, ans[i]));
  const score = results.filter(Boolean).length;
  const put = (i: number, v: unknown) => {
    setChecked(false);
    setAns((a) => a.map((x, j) => (j === i ? v : x)));
  };
  return (
    <div className="space-y-3">
      {questions.map((q, i) => {
        const ok = results[i];
        return (
          <div key={i} className={`rounded border p-2 ${checked ? (ok ? 'border-emerald-400/50' : 'border-glow-red/60') : 'border-edge'} bg-[#0f1221]`}>
            <div className="mb-1.5 text-[12px] text-slate-200">
              <span className="mr-1 text-slate-500">Câu {i + 1}.</span>
              {q.prompt}
              {checked && <span className={`ml-2 ${ok ? 'text-emerald-300' : 'text-glow-red'}`}>{ok ? '✓' : '✗'}</span>}
            </div>
            {q.kind === 'choice' && (
              <div className="grid gap-1">
                {q.options.map((o, k) => (
                  <label
                    key={k}
                    className={`flex cursor-pointer items-start gap-2 rounded px-1.5 py-0.5 text-[11.5px] ${ans[i] === k ? 'bg-[#1b1f38] text-glow-amber' : 'text-slate-300 hover:bg-[#151a33]'} ${reveal && k === q.answer ? 'outline outline-1 outline-emerald-400/60' : ''}`}
                  >
                    <input type="radio" className="mt-0.5 accent-[#ffc94a]" checked={ans[i] === k} onChange={() => put(i, k)} />
                    {o}
                  </label>
                ))}
              </div>
            )}
            {q.kind === 'number' && (
              <div className="flex items-center gap-2">
                <input
                  value={String(ans[i] ?? '')}
                  onChange={(e) => put(i, e.target.value)}
                  inputMode="decimal"
                  className="w-28 rounded border border-edge bg-ink px-2 py-0.5 font-mono text-[12px] text-glow-amber outline-none focus:border-glow-amber"
                />
                {q.unit && <span className="text-[11px] text-slate-400">{q.unit}</span>}
              </div>
            )}
            {q.kind === 'seq' && (
              <input
                value={String(ans[i] ?? '')}
                onChange={(e) => put(i, e.target.value)}
                placeholder={`vd: ${b(q.answer[0], q.bits)} → ${b(q.answer[1] ?? 0, q.bits)} → …`}
                className="w-full rounded border border-edge bg-ink px-2 py-0.5 font-mono text-[12px] text-glow-amber outline-none focus:border-glow-amber"
              />
            )}
            {q.kind === 'cells' && (
              <table className="border-collapse text-center font-mono text-[11px]">
                <thead>
                  <tr>
                    <th className="border border-edge px-1.5 py-0.5 text-slate-500">{q.rows[0]?.label.includes('→') ? 'Qn → Qn+1' : 'Q2Q1Q0'}</th>
                    {q.columns.map((c) => (
                      <th key={c} className="border border-edge px-1.5 py-0.5 text-glow-cyan">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {q.rows.map((r, ri) => (
                    <tr key={ri}>
                      <td className="border border-edge px-1.5 text-slate-300">{r.label}</td>
                      {r.cells.map((c, ci) => {
                        const grid = (ans[i] as string[][] | undefined) ?? [];
                        const v = grid[ri]?.[ci] ?? '';
                        const good = v.trim().toUpperCase() === c.toUpperCase();
                        return (
                          <td key={ci} className={`border border-edge p-0 ${checked ? (good ? 'bg-[rgba(93,255,155,0.08)]' : 'bg-[rgba(255,77,94,0.18)]') : ''}`}>
                            <input
                              value={reveal ? c : v}
                              readOnly={reveal}
                              maxLength={c.length + 1}
                              onChange={(e) => {
                                const g = q.rows.map((_, a) => q.columns.map((__, z) => grid[a]?.[z] ?? ''));
                                g[ri][ci] = e.target.value;
                                put(i, g);
                              }}
                              className={`w-10 bg-transparent px-1 py-0.5 text-center outline-none ${reveal ? 'text-emerald-300' : 'text-glow-amber'}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {(reveal || (checked && !ok)) && (
              <div className="mt-1 text-[11px] text-emerald-300">
                Đáp án: {answerText(q)}
                {q.explain && <span className="text-slate-400"> — {q.explain}</span>}
              </div>
            )}
          </div>
        );
      })}
      <div className="flex items-center gap-2">
        <button
          className="btn-primary text-base"
          onClick={() => {
            setChecked(true);
            if (score === questions.length) onPass();
          }}
        >
          Kiểm tra
        </button>
        <button className={`btn ${reveal ? 'btn-on' : ''}`} onClick={() => setReveal((r) => !r)}>
          {reveal ? 'Ẩn đáp án' : 'Xem đáp án'}
        </button>
        {checked && (
          <span className={`font-pixel text-lg ${score === questions.length ? 'text-emerald-300' : 'text-glow-amber'}`}>
            {score}/{questions.length} đúng
          </span>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ detail
function Detail({
  ex,
  circuit,
  progress,
  onProgress,
  onLoadCircuit,
  onLoadPreset,
}: {
  ex: Exercise;
  circuit: Circuit;
  progress: Progress | undefined;
  onProgress: (p: Progress) => void;
  onLoadCircuit: (c: Circuit) => void;
  onLoadPreset: (id: string) => void;
}) {
  const [result, setResult] = useState<CheckResult | null>(null);
  const [hint, setHint] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  useEffect(() => {
    setResult(null);
    setHint(false);
    setShowAnswer(false);
  }, [ex.id]);
  const H = ({ children }: { children: string }) => <h4 className="mb-2 mt-4 font-pixel text-lg tracking-widest text-glow-cyan">{children}</h4>;

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span className={`rounded border px-1.5 text-[10px] ${LEVEL_STYLE[ex.level]}`}>{LEVEL_LABEL[ex.level]}</span>
        {ex.extra ? (
          <span className="rounded border border-glow-cyan/50 px-1.5 text-[10px] text-glow-cyan">Đề xuất bổ sung</span>
        ) : (
          <span className="rounded border border-slate-500/50 px-1.5 text-[10px] text-slate-300">Bám sát giáo án</span>
        )}
        {isDone(ex, progress) && <span className="text-[11px] text-emerald-300">✓ Hoàn thành</span>}
      </div>
      <h3 className="font-pixel text-2xl leading-tight text-glow-amber">
        {ex.id} · {ex.title}
      </h3>
      <p className="mb-2 text-[10.5px] text-slate-500">Nguồn: {ex.source}</p>
      {ex.prompt.map((p, i) => (
        <p key={i} className="mb-1 text-[12px] leading-relaxed text-slate-200">
          {p}
        </p>
      ))}

      {ex.questions && (
        <>
          <H>CÂU HỎI</H>
          <Quiz key={ex.id} questions={ex.questions} onPass={() => onProgress({ ...progress, quiz: true })} />
        </>
      )}

      {ex.wave && (
        <>
          <H>VẼ GIẢN ĐỒ XUNG</H>
          <WaveformExercise task={ex.wave} onScore={(pct) => onProgress({ ...progress, wave: Math.max(pct, progress?.wave ?? 0) })} />
        </>
      )}

      {ex.build && (
        <>
          <H>THỰC HÀNH LẮP MẠCH</H>
          <div className="flex flex-wrap gap-1.5">
            {ex.build.starter && (
              <button className="btn" onClick={() => onLoadCircuit(ex.build!.starter!())}>
                ▶ Mở mạch khởi đầu
              </button>
            )}
            {!ex.build.starter && ex.build.solutionPreset && (
              <button className="btn" onClick={() => onLoadPreset(ex.build!.solutionPreset!)}>
                ▶ Mở mạch đề bài
              </button>
            )}
            <button
              className="btn-primary text-base"
              onClick={() => {
                const r = runCheck(circuit, ex.build!.check);
                setResult(r);
                if (r.ok) onProgress({ ...progress, build: true });
              }}
            >
              Kiểm tra mạch hiện tại
            </button>
            <button className={`btn ${hint ? 'btn-on' : ''}`} onClick={() => setHint((h) => !h)}>
              Gợi ý
            </button>
            {ex.build.solutionPreset && ex.build.starter && (
              <button className="btn" onClick={() => onLoadPreset(ex.build!.solutionPreset!)}>
                Mở mạch đáp án
              </button>
            )}
          </div>
          {hint && <p className="mt-1 text-[11px] text-glow-cyan">💡 {ex.build.hint}</p>}
          {result && (
            <div className={`mt-2 rounded border p-2 ${result.ok ? 'border-emerald-400/50' : 'border-glow-red/50'} bg-[#0f1221]`}>
              <div className={`mb-1 font-pixel text-lg ${result.ok ? 'text-emerald-300' : 'text-glow-red'}`}>{result.ok ? '✓ MẠCH ĐÚNG' : '✗ CHƯA ĐÚNG'}</div>
              <ul className="space-y-0.5 text-[11px]">
                {result.lines.map((l, i) => (
                  <li key={i} className={l.ok ? 'text-slate-300' : 'text-[#ff8a96]'}>
                    {l.ok ? '✓' : '✗'} {l.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <H>ĐÁP ÁN / LỜI GIẢI</H>
      <button className={`btn ${showAnswer ? 'btn-on' : ''}`} onClick={() => setShowAnswer((s) => !s)}>
        {showAnswer ? 'Ẩn lời giải' : 'Xem lời giải'}
      </button>
      {showAnswer && (
        <div className="mt-2 space-y-1 rounded border border-emerald-400/40 bg-[#0d1f18] p-2 text-[12px] text-emerald-100">
          {ex.answer.map((a, i) => (
            <p key={i}>{a}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ panel
export default function ExercisePanel({ circuit, onLoadCircuit, onLoadPreset, onClose }: Props) {
  const [sel, setSel] = useState<string | null>(null);
  const [part, setPart] = useState<'all' | 'A' | 'B' | 'C'>('all');
  const [progress, setProgress] = useState<Record<string, Progress>>(loadProgress);
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(progress));
    } catch {
      /* ignore */
    }
  }, [progress]);
  const list = useMemo(() => EXERCISES.filter((e) => part === 'all' || e.part === part), [part]);
  const done = EXERCISES.filter((e) => isDone(e, progress[e.id])).length;
  const ex = EXERCISES.find((e) => e.id === sel);
  const idx = ex ? EXERCISES.indexOf(ex) : -1;

  return (
    <aside className="flex w-[min(600px,46vw)] min-w-[380px] shrink-0 flex-col border-l border-edge bg-panel">
      <div className="flex items-center gap-2 border-b border-edge px-3 py-2">
        {ex ? (
          <button className="btn px-1.5" onClick={() => setSel(null)} title="Danh sách">
            ← Danh sách
          </button>
        ) : (
          <span className="font-pixel text-xl tracking-widest text-glow-cyan">📝 BÀI TẬP</span>
        )}
        <span className="text-[11px] text-slate-400">
          {done}/{EXERCISES.length} hoàn thành
        </span>
        <div className="ml-2 h-1.5 flex-1 overflow-hidden rounded bg-ink">
          <div className="h-full bg-emerald-400" style={{ width: `${(done / EXERCISES.length) * 100}%` }} />
        </div>
        {ex && (
          <>
            <button className="btn px-1.5" disabled={idx <= 0} onClick={() => setSel(EXERCISES[idx - 1].id)} title="Bài trước">
              ‹
            </button>
            <button className="btn px-1.5" disabled={idx >= EXERCISES.length - 1} onClick={() => setSel(EXERCISES[idx + 1].id)} title="Bài sau">
              ›
            </button>
          </>
        )}
        <button className="btn px-1.5" onClick={onClose} title="Đóng (E)">
          ✕
        </button>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
        {ex ? (
          <Detail
            ex={ex}
            circuit={circuit}
            progress={progress[ex.id]}
            onProgress={(p) => setProgress((all) => ({ ...all, [ex.id]: p }))}
            onLoadCircuit={onLoadCircuit}
            onLoadPreset={onLoadPreset}
          />
        ) : (
          <>
            <p className="mb-2 text-[11px] leading-relaxed text-slate-400">
              Hệ thống bài tập bám sát <b className="text-slate-200">Giáo án ôn tập Kỹ thuật số</b> (Phần A, B) cùng các bài{' '}
              <span className="text-glow-cyan">đề xuất bổ sung</span> và Phần C bộ đếm đồng bộ. Mỗi bài có thể gồm câu hỏi, vẽ giản đồ xung (chấm từng ô) và lắp
              mạch (máy tự chạy thử).
            </p>
            <div className="mb-3 flex gap-1">
              {(['all', 'A', 'B', 'C'] as const).map((p) => (
                <button key={p} className={`btn ${part === p ? 'btn-on' : ''}`} onClick={() => setPart(p)}>
                  {p === 'all' ? 'Tất cả' : `Phần ${p}`}
                </button>
              ))}
            </div>
            {(['A', 'B', 'C'] as const)
              .filter((p) => part === 'all' || part === p)
              .map((p) => (
                <div key={p} className="mb-4">
                  <h3 className="mb-1.5 font-pixel text-xl tracking-wider text-glow-amber">{PART_TITLE[p]}</h3>
                  <div className="space-y-1.5">
                    {list
                      .filter((e) => e.part === p)
                      .map((e) => {
                        const d = isDone(e, progress[e.id]);
                        return (
                          <button
                            key={e.id}
                            onClick={() => setSel(e.id)}
                            className="flex w-full items-start gap-2 rounded border border-edge bg-[#12162a] px-2 py-1.5 text-left hover:border-[#4a5488]"
                          >
                            <span className={`mt-0.5 w-8 shrink-0 font-pixel text-lg ${d ? 'text-emerald-300' : 'text-slate-500'}`}>{d ? '✓' : e.id}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[12px] text-slate-100">{e.title}</span>
                              <span className="mt-0.5 flex flex-wrap gap-1 text-[10px]">
                                <span className={`rounded border px-1 ${LEVEL_STYLE[e.level]}`}>{LEVEL_LABEL[e.level]}</span>
                                {e.questions && <span className="rounded border border-edge px-1 text-slate-400">câu hỏi</span>}
                                {e.wave && <span className="rounded border border-edge px-1 text-slate-400">vẽ giản đồ</span>}
                                {e.build && <span className="rounded border border-edge px-1 text-slate-400">lắp mạch</span>}
                                {e.extra && <span className="rounded border border-glow-cyan/40 px-1 text-glow-cyan">đề xuất</span>}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              ))}
          </>
        )}
      </div>
    </aside>
  );
}
