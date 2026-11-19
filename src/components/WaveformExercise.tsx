// Interactive "vẽ giản đồ xung" exercise: click / drag on the slots of each
// answer track to draw it, then check against the engine-computed answer.
import { useEffect, useRef, useState } from 'react';
import type { WaveTask } from '../exercises/types';

interface Props {
  task: WaveTask;
  onScore: (pct: number) => void;
}

const LABEL = 54;
const ROW = 28;
const TOP = 22;

function wavePath(bits: number[], x0: number, cell: number, yHi: number, yLo: number) {
  let d = '';
  bits.forEach((b, i) => {
    if (b < 0) return;
    const y = b ? yHi : yLo;
    const x = x0 + i * cell;
    const prev = bits[i - 1];
    if (i === 0 || prev === undefined || prev < 0) d += `M${x},${y}`;
    else if (prev !== b) d += `L${x},${prev ? yHi : yLo}L${x},${y}`;
    d += `L${x + cell},${y}`;
  });
  return d;
}

export default function WaveformExercise({ task, onScore }: Props) {
  const slots = task.inputs[0].bits.length;
  const blank = () => task.answers.map(() => new Array<number>(slots).fill(-1));
  const [draft, setDraft] = useState<number[][]>(blank);
  const [aid1, setAid1] = useState(false);
  const [aid2, setAid2] = useState(false);
  const [aid3, setAid3] = useState(false);
  const [checked, setChecked] = useState(false);
  const [reveal, setReveal] = useState(false);
  const paint = useRef<{ track: number; value: number; last: number } | null>(null);

  useEffect(() => {
    setDraft(blank());
    setChecked(false);
    setReveal(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);
  useEffect(() => {
    const up = () => (paint.current = null);
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  const cell = slots > 34 ? 11 : 14;
  const W = LABEL + slots * cell + 8;
  const nIn = task.inputs.length;
  const nAns = task.answers.length;
  const ansTop = TOP + nIn * ROW + 8;
  const H = ansTop + nAns * (ROW + 6) + (reveal && task.counterBits ? 22 : 0) + 18;
  const xOf = (slot: number) => LABEL + slot * cell;

  /** Paint slots [from..to] (any order) of one track. */
  const set = (track: number, from: number, value: number, to = from) => {
    const a = Math.min(from, to);
    const z = Math.max(from, to);
    setChecked(false);
    setDraft((d) => d.map((row, t) => (t === track ? row.map((v, i) => (i >= a && i <= z ? value : v)) : row)));
  };

  const results = task.answers.map((a, t) => a.bits.map((v, i) => draft[t][i] === v));
  const total = slots * nAns;
  const correct = results.flat().filter(Boolean).length;
  const pct = Math.round((correct / total) * 100);

  const check = () => {
    setChecked(true);
    onScore(pct);
  };

  const asyncEvents = task.events.filter((e) => e.kind === 'pre' || e.kind === 'clr' || e.kind === 'both');
  const markLines = [...task.edges, ...asyncEvents.map((e) => e.slot)];

  return (
    <div>
      <p className="mb-1 text-[11px] text-slate-400">{task.initNote}</p>
      <div className="mb-2 flex flex-wrap gap-1">
        <button className={`btn ${aid1 ? 'btn-on' : ''}`} onClick={() => setAid1((v) => !v)} title="Bước 1: xác định cạnh tích cực và điểm PRE/CLR">
          ① Mốc thời gian
        </button>
        <button className={`btn ${aid2 ? 'btn-on' : ''}`} onClick={() => setAid2((v) => !v)} title="Bước 2: kẻ đường gióng nét đứt">
          ② Đường gióng
        </button>
        <button className={`btn ${aid3 ? 'btn-on' : ''}`} onClick={() => setAid3((v) => !v)} title="Bước 3: tra bảng chân trị">
          ③ Tra bảng
        </button>
      </div>
      {aid3 && <div className="mb-2 rounded border border-glow-cyan/40 bg-[#0d2a30] px-2 py-1 text-[11px] text-glow-cyan">{task.rule}</div>}

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="touch-none select-none rounded border border-edge bg-[#0b0e1c]">
        {/* slot grid */}
        {Array.from({ length: slots + 1 }, (_, i) => (
          <line key={i} x1={xOf(i)} x2={xOf(i)} y1={TOP} y2={H - 16} stroke={i % 2 ? '#141933' : '#1a2040'} strokeWidth={1} />
        ))}
        {/* aids: active edges + async points */}
        {aid1 &&
          task.edges.map((e) => (
            <text key={`a${e}`} x={xOf(e)} y={14} fill="#4de8ff" fontSize={13} textAnchor="middle" fontFamily="VT323, monospace">
              {task.edgeDir === 'rising' ? '↑' : '↓'}
            </text>
          ))}
        {aid1 &&
          asyncEvents.map((e) => (
            <text key={`p${e.slot}`} x={xOf(e.slot) + 2} y={14} fill={e.kind === 'clr' ? '#ff4d5e' : '#ffb02e'} fontSize={11} fontFamily="VT323, monospace">
              {e.kind === 'clr' ? 'CLR!' : e.kind === 'pre' ? 'PRE!' : 'CẤM'}
            </text>
          ))}
        {aid2 &&
          markLines.map((s, i) => (
            <line key={`g${i}`} x1={xOf(s)} x2={xOf(s)} y1={TOP - 4} y2={H - 16} stroke="#4de8ff" strokeOpacity={0.55} strokeDasharray="3 3" />
          ))}

        {/* given inputs */}
        {task.inputs.map((tr, r) => {
          const y0 = TOP + r * ROW;
          const isClk = r === 0;
          return (
            <g key={tr.name}>
              <text x={6} y={y0 + ROW / 2 + 4} fill={isClk ? '#4de8ff' : '#c9d1ff'} fontSize={14} fontFamily="VT323, monospace">
                {tr.name}
              </text>
              <path d={wavePath(tr.bits, LABEL, cell, y0 + 5, y0 + ROW - 5)} fill="none" stroke={isClk ? '#4de8ff' : '#c9d1ff'} strokeWidth={1.6} />
            </g>
          );
        })}

        {/* answer tracks */}
        {task.answers.map((tr, t) => {
          const y0 = ansTop + t * (ROW + 6);
          const yHi = y0 + 5;
          const yLo = y0 + ROW - 5;
          return (
            <g key={tr.name}>
              <rect x={LABEL} y={y0} width={slots * cell} height={ROW} fill="#12162a" stroke="#2a3160" />
              <text x={6} y={y0 + ROW / 2 + 4} fill="#ffc94a" fontSize={15} fontFamily="VT323, monospace">
                {tr.name} ✎
              </text>
              {draft[t].map((v, i) => (
                <rect
                  key={i}
                  x={xOf(i)}
                  y={y0}
                  width={cell}
                  height={ROW}
                  fill={checked ? (results[t][i] ? 'rgba(93,255,155,0.10)' : 'rgba(255,77,94,0.28)') : v < 0 ? 'rgba(89,96,122,0.18)' : 'transparent'}
                  className="cursor-pointer hover:fill-[rgba(255,201,74,0.15)]"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    const value = v === 1 ? 0 : 1;
                    paint.current = { track: t, value, last: i };
                    set(t, i, value);
                  }}
                  onPointerEnter={() => {
                    const p = paint.current;
                    if (!p || p.track !== t) return;
                    set(t, p.last, p.value, i); // fill any slots skipped by a fast drag
                    p.last = i;
                  }}
                />
              ))}
              <path d={wavePath(draft[t], LABEL, cell, yHi, yLo)} fill="none" stroke="#ffc94a" strokeWidth={2.2} pointerEvents="none" />
              {reveal && (
                <path d={wavePath(tr.bits, LABEL, cell, yHi, yLo)} fill="none" stroke="#5dff9b" strokeWidth={1.6} strokeDasharray="4 3" pointerEvents="none" />
              )}
              {reveal &&
                (task.spikes ?? [])
                  .filter((s) => s.track === t)
                  .map((s, k) => (
                    <path
                      key={k}
                      d={`M${xOf(s.slot) - 1.5},${s.level ? yLo : yHi} L${xOf(s.slot)},${s.level ? yHi - 3 : yLo + 3} L${xOf(s.slot) + 1.5},${s.level ? yLo : yHi}`}
                      fill="none"
                      stroke="#ff4d5e"
                      strokeWidth={1.8}
                      pointerEvents="none"
                    />
                  ))}
            </g>
          );
        })}

        {/* counter value per slot (answer) */}
        {reveal && task.counterBits && (
          <g>
            {Array.from({ length: slots }, (_, i) => {
              const v = task.answers.reduce((acc, a, b) => acc | (a.bits[i] << b), 0);
              const prev = i ? task.answers.reduce((acc, a, b) => acc | (a.bits[i - 1] << b), 0) : -1;
              if (v === prev) return null;
              return (
                <text key={i} x={xOf(i) + 2} y={ansTop + nAns * (ROW + 6) + 12} fill="#ffc94a" fontSize={11} fontFamily="VT323, monospace">
                  {v.toString(2).padStart(task.counterBits!, '0')}
                </text>
              );
            })}
          </g>
        )}
        {/* slot numbers */}
        {Array.from({ length: Math.floor(slots / 4) + 1 }, (_, k) => (
          <text key={k} x={xOf(k * 4)} y={H - 4} fill="#59607a" fontSize={10} textAnchor="middle" fontFamily="VT323, monospace">
            {k * 4}
          </text>
        ))}
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          className="btn"
          onClick={() => {
            setChecked(false);
            setDraft((d) => d.map((row, t) => row.map((v, i) => (v < 0 ? (i === 0 ? task.answers[t].bits[0] : -1) : v))));
          }}
          title="Điền mức ban đầu ở ô đầu tiên"
        >
          Điền trạng thái đầu
        </button>
        <button
          className="btn"
          onClick={() => {
            setDraft(blank());
            setChecked(false);
          }}
        >
          Xóa
        </button>
        <button className="btn-primary text-base" onClick={check}>
          Kiểm tra
        </button>
        <button className={`btn ${reveal ? 'btn-on' : ''}`} onClick={() => setReveal((r) => !r)}>
          {reveal ? 'Ẩn đáp án' : 'Xem đáp án'}
        </button>
        {checked && (
          <span className={`font-pixel text-lg ${pct === 100 ? 'text-emerald-300' : 'text-glow-red'}`}>
            {pct === 100 ? '✓ CHÍNH XÁC 100%' : `${pct}% đúng · ô đỏ là chỗ sai`}
          </span>
        )}
      </div>
      <p className="mt-1 text-[10px] text-slate-500">Bấm hoặc kéo trên hàng ✎ để vẽ mức 1/0 cho từng ô thời gian. Ô xám = chưa vẽ.</p>

      {reveal && (
        <div className="mt-2 rounded border border-edge bg-[#0f1221] p-2">
          <div className="mb-1 font-pixel text-base tracking-wide text-emerald-300">ĐÁP ÁN TỪNG MỐC (bước 3 · tra bảng)</div>
          <ol className="space-y-0.5 font-mono text-[11px] text-slate-300">
            {task.events.map((e, i) => (
              <li key={i}>
                <span className="text-slate-500">mốc {String(e.slot).padStart(2, ' ')}:</span> {e.text}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
