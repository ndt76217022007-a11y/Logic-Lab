import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Circuit, CircuitFile, Lesson } from './types/circuit';
import CircuitCanvas, { type Selection, type Tool } from './components/CircuitCanvas';
import TopHud from './components/TopHud';
import LessonSidebar, { type LessonStatus } from './components/LessonSidebar';
import DominoTestPanel from './components/DominoTestPanel';
import Toolbox, { PLACE_KEYS } from './components/Toolbox';
import Inspector from './components/Inspector';
import TimingDiagram from './components/TimingDiagram';
import AnalysisPanel from './components/AnalysisPanel';
import ReferenceDrawer from './components/ReferenceDrawer';
import HelpPanel from './components/HelpPanel';
import ExercisePanel from './components/ExercisePanel';
import { STARTER_LESSONS, NAND_EXAMPLE, cloneCircuit } from './lessons/starterLessons';
import { SEQUENTIAL_PRESETS } from './lessons/sequentialPresets';
import { countTransistors } from './engine/componentDefs';
import { verifyCircuit, type VerifyResult } from './engine/dominoVerifier';
import { LiveSimulator } from './engine/simulator';

const STORAGE_KEY = 'logic-lab:circuit:v2';
const BLANK: Circuit = { name: 'UNTITLED', components: [], wires: [], probes: [] };

function loadSaved(): Circuit | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Circuit;
    return Array.isArray(c.components) && Array.isArray(c.wires) ? c : null;
  } catch {
    return null;
  }
}

interface History {
  circuit: Circuit;
  past: Circuit[];
  future: Circuit[];
}

interface DominoRun {
  lesson: Lesson;
  result: VerifyResult;
  runId: number;
}

export default function App() {
  const [hist, setHist] = useState<History>(() => ({
    circuit: loadSaved() ?? SEQUENTIAL_PRESETS.find((p) => p.id === 'mod7')!.build(),
    past: [],
    future: [],
  }));
  const circuit = hist.circuit;
  const [sim] = useState(() => new LiveSimulator(hist.circuit));
  const [tool, setTool] = useState<Tool>({ mode: 'select' });
  const [selection, setSelection] = useState<Selection>(null);
  const [fitKey, setFitKey] = useState(0);
  const [activeLesson, setActiveLesson] = useState<string | null>(null);
  const [lessonsCollapsed, setLessonsCollapsed] = useState(true);
  const [analysisCollapsed, setAnalysisCollapsed] = useState(false);
  const [timingCollapsed, setTimingCollapsed] = useState(false);
  const [status, setStatus] = useState<Record<string, LessonStatus>>({});
  const [domino, setDomino] = useState<DominoRun | null>(null);
  const [tps, setTps] = useState(100);
  const [clockRunning, setClockRunning] = useState(true);
  const [dock, setDock] = useState<'none' | 'ref' | 'help' | 'ex'>('none');
  const toggleDock = useCallback((d: 'ref' | 'help' | 'ex') => {
    setDock((cur) => {
      const next = cur === d ? 'none' : d;
      // Keep the canvas usable on narrower screens: one side panel at a time.
      if (next !== 'none' && window.innerWidth < 1500) setAnalysisCollapsed(true);
      return next;
    });
  }, []);

  useEffect(() => {
    sim.clockRunning = clockRunning;
  }, [sim, clockRunning]);

  // Dev-only debugging handle.
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __sim?: LiveSimulator }).__sim = sim;
  }, [sim]);

  const onChange = useCallback((next: Circuit, push: boolean) => {
    setHist((h) => ({
      circuit: next,
      past: push ? [...h.past.slice(-99), h.circuit] : h.past,
      future: push ? [] : h.future,
    }));
  }, []);

  /** Load a whole new board: power-on reset + fresh timing diagram. */
  const replace = useCallback(
    (next: Circuit) => {
      const c = cloneCircuit(next);
      c.probes ??= [];
      sim.reset(c);
      onChange(c, true);
      setSelection(null);
      setFitKey((k) => k + 1);
    },
    [onChange, sim],
  );

  const undo = useCallback(() => {
    setHist((h) => (h.past.length ? { circuit: h.past[h.past.length - 1], past: h.past.slice(0, -1), future: [h.circuit, ...h.future] } : h));
    setSelection(null);
  }, []);
  const redo = useCallback(() => {
    setHist((h) => (h.future.length ? { circuit: h.future[0], past: [...h.past, h.circuit], future: h.future.slice(1) } : h));
    setSelection(null);
  }, []);

  // Autosave
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(circuit));
    } catch {
      /* storage unavailable: ignore */
    }
  }, [circuit]);

  // Global shortcuts (canvas handles R / W / V / P / Del / Esc / F).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (!e.ctrlKey && !e.metaKey && PLACE_KEYS[e.key]) {
        setTool(PLACE_KEYS[e.key]);
      } else if (e.key === 'Enter' || e.key === '.') {
        sim.stepEdge();
      } else if (e.key === 'F1') {
        e.preventDefault();
        toggleDock('help');
      } else if ((e.key === 'b' || e.key === 'B') && !e.ctrlKey && !e.metaKey) {
        toggleDock('ref');
      } else if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.metaKey) {
        toggleDock('ex');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, sim, toggleDock]);

  const loadPreset = useCallback(
    (id: string) => {
      const p = SEQUENTIAL_PRESETS.find((x) => x.id === id);
      if (p) replace(p.build());
    },
    [replace],
  );

  const transistors = useMemo(() => countTransistors(circuit.components), [circuit.components]);
  const hasClock = circuit.components.some((c) => c.kind === 'clock');

  const runTest = useCallback(
    (lesson: Lesson) => {
      const result = verifyCircuit(circuit, lesson);
      setStatus((s) => ({ ...s, [lesson.id]: result.allPass ? 'pass' : 'fail' }));
      setDomino((d) => ({ lesson, result, runId: (d?.runId ?? 0) + 1 }));
    },
    [circuit],
  );

  const exportJson = () => {
    const file: CircuitFile = { format: 'logic-lab-circuit', version: 1, circuit };
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(circuit.name || 'circuit').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importJson = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as Partial<CircuitFile> & Partial<Circuit>;
      const c = data.format === 'logic-lab-circuit' ? data.circuit : (data as Circuit);
      if (!c || !Array.isArray(c.components) || !Array.isArray(c.wires)) throw new Error('bad file');
      replace({ name: c.name ?? 'IMPORTED', components: c.components, wires: c.wires, probes: c.probes ?? [] });
    } catch {
      alert('That file is not a Logic Lab circuit (.json).');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <TopHud
        transistors={transistors}
        circuitName={circuit.name}
        onRename={(name) => onChange({ ...circuit, name }, false)}
        onExport={exportJson}
        onImport={importJson}
        onUndo={undo}
        onRedo={redo}
        canUndo={hist.past.length > 0}
        canRedo={hist.future.length > 0}
        onClear={() => replace(BLANK)}
        ticksPerSecond={tps}
        onTicksPerSecond={setTps}
        hasClock={hasClock}
        clockRunning={clockRunning}
        onToggleClock={() => setClockRunning((r) => !r)}
        onStepEdge={() => {
          setClockRunning(false);
          sim.clockRunning = false;
          sim.stepEdge();
        }}
        onReset={() => sim.reset(circuit)}
        presets={SEQUENTIAL_PRESETS}
        onLoadPreset={loadPreset}
        dock={dock}
        onDock={toggleDock}
      />
      <div className="flex min-h-0 flex-1">
        <LessonSidebar
          lessons={STARTER_LESSONS}
          activeId={activeLesson}
          status={status}
          collapsed={lessonsCollapsed}
          onToggle={() => setLessonsCollapsed((c) => !c)}
          onSelect={(id) => setActiveLesson((a) => (a === id ? null : id))}
          onStart={(l) => replace(l.starter)}
          onLoadSolution={(l) => replace(l.solution)}
          onTest={runTest}
          onLoadNandExample={() => replace(NAND_EXAMPLE())}
          onBlank={() => replace(BLANK)}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <CircuitCanvas
              circuit={circuit}
              sim={sim}
              onChange={onChange}
              tool={tool}
              onToolChange={setTool}
              selection={selection}
              onSelect={setSelection}
              fitKey={fitKey}
              ticksPerSecond={tps}
            />
            <Toolbox tool={tool} onTool={setTool} />
            <Inspector circuit={circuit} selection={selection} onChange={onChange} onSelect={setSelection} />
          </div>
          <TimingDiagram
            sim={sim}
            circuit={circuit}
            onChange={onChange}
            collapsed={timingCollapsed}
            onToggle={() => setTimingCollapsed((c) => !c)}
          />
          {domino && (
            <DominoTestPanel
              result={domino.result}
              runId={domino.runId}
              lessonTitle={domino.lesson.title}
              onRerun={() => runTest(domino.lesson)}
              onClose={() => setDomino(null)}
            />
          )}
        </main>
        {dock === 'ref' && <ReferenceDrawer onClose={() => setDock('none')} onLoadPreset={loadPreset} />}
        {dock === 'help' && <HelpPanel onClose={() => setDock('none')} onOpenReference={() => setDock('ref')} />}
        {dock === 'ex' && <ExercisePanel circuit={circuit} onLoadCircuit={replace} onLoadPreset={loadPreset} onClose={() => setDock('none')} />}
        <AnalysisPanel
          sim={sim}
          circuit={circuit}
          selection={selection}
          collapsed={analysisCollapsed}
          onToggle={() => setAnalysisCollapsed((c) => !c)}
        />
      </div>
    </div>
  );
}
