import type { Lesson } from '../types/circuit';

export type LessonStatus = 'untested' | 'pass' | 'fail';

interface Props {
  lessons: Lesson[];
  activeId: string | null;
  status: Record<string, LessonStatus>;
  collapsed: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onStart: (lesson: Lesson) => void;
  onLoadSolution: (lesson: Lesson) => void;
  onTest: (lesson: Lesson) => void;
  onLoadNandExample: () => void;
  onBlank: () => void;
}

const dot: Record<LessonStatus, string> = {
  untested: 'bg-slate-600',
  pass: 'bg-emerald-400 shadow-[0_0_6px_#34d399]',
  fail: 'bg-glow-red shadow-[0_0_6px_#ff4d5e]',
};

export default function LessonSidebar(p: Props) {
  if (p.collapsed) {
    return (
      <aside className="flex w-9 flex-col items-center border-r border-edge bg-panel py-2">
        <button className="btn px-1.5" onClick={p.onToggle} title="Show lessons">
          »
        </button>
        <div className="mt-4 font-pixel text-lg tracking-widest text-slate-500 [writing-mode:vertical-rl]">LESSONS</div>
      </aside>
    );
  }
  return (
    <aside className="scroll-thin flex w-80 shrink-0 flex-col overflow-y-auto border-r border-edge bg-panel">
      <div className="flex items-center justify-between border-b border-edge px-3 py-2">
        <span className="font-pixel text-xl tracking-widest text-glow-cyan">LEVEL 1 · LESSONS</span>
        <button className="btn px-1.5" onClick={p.onToggle} title="Collapse">
          «
        </button>
      </div>

      <div className="flex flex-col gap-2 p-3">
        {p.lessons.map((l, i) => {
          const open = l.id === p.activeId;
          return (
            <div
              key={l.id}
              className={`rounded border ${open ? 'border-glow-amber/60 bg-[#1b1f38]' : 'border-edge bg-[#12162a]'} transition-colors`}
            >
              <button className="flex w-full items-center gap-2 px-3 py-2 text-left" onClick={() => p.onSelect(l.id)}>
                <span className={`h-2 w-2 rounded-full ${dot[p.status[l.id] ?? 'untested']}`} />
                <span className="font-pixel text-lg text-slate-100">
                  {i + 1}. {l.title}
                </span>
                <span className="ml-auto text-[10px] text-slate-500">
                  {l.transistorBudget} transistor{l.transistorBudget > 1 ? 's' : ''}
                </span>
              </button>
              {open && (
                <div className="space-y-3 px-3 pb-3 text-xs text-slate-300">
                  <p className="text-slate-400">{l.summary}</p>
                  <ol className="list-decimal space-y-1 pl-4 text-[11px] text-slate-300">
                    {l.steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                  <table className="w-full border-collapse text-center font-mono text-[11px]">
                    <thead>
                      <tr className="text-glow-cyan">
                        {l.inputs.map((k) => (
                          <th key={k} className="border border-edge px-1 py-0.5">
                            {k}
                          </th>
                        ))}
                        {l.outputs.map((k) => (
                          <th key={k} className="border border-edge px-1 py-0.5 text-glow-amber">
                            {k}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {l.truthTable.map((r, ri) => (
                        <tr key={ri}>
                          {l.inputs.map((k) => (
                            <td key={k} className="border border-edge px-1 py-0.5">
                              {r.inputs[k]}
                            </td>
                          ))}
                          {l.outputs.map((k) => (
                            <td key={k} className="border border-edge px-1 py-0.5 text-glow-amber">
                              {r.outputs[k]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn" onClick={() => p.onStart(l)}>
                      Start (starter board)
                    </button>
                    <button className="btn" onClick={() => p.onLoadSolution(l)}>
                      Load Solution
                    </button>
                  </div>
                  <button className="btn-primary w-full" onClick={() => p.onTest(l)}>
                    TEST CIRCUIT (DOMINO MODE)
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-auto border-t border-edge p-3">
        <div className="mb-2 font-pixel text-lg tracking-widest text-slate-400">PRESETS</div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={p.onLoadNandExample}>
            2-Transistor NAND
          </button>
          <button className="btn" onClick={p.onBlank}>
            Blank board
          </button>
        </div>
        <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
          Drag from a pin to draw a wire · W wire tool (click bends, F flips, Esc ends) · R rotate · Del delete · Space/middle-drag pan · wheel zoom ·
          click a switch to toggle.
        </p>
      </div>
    </aside>
  );
}
