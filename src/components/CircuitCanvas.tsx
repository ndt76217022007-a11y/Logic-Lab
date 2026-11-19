import { useEffect, useRef } from 'react';
import { GRID_PX, type Circuit, type CircuitComponent, type ComponentKind, type Point, type ProbeTarget, type Rotation } from '../types/circuit';
import { toggleProbe } from '../engine/probes';
import {
  KIND_INFO,
  componentTitle,
  gateExpression,
  gateInputCount,
  lRoute,
  newId,
  onSegment,
  pinsOf,
  ptKey,
  simplifyPath,
  worldBounds,
} from '../engine/componentDefs';
import { LiveSimulator, describeNet } from '../engine/simulator';
import { COLORS, drawComponent, drawGrid, drawJunction, drawWire, netColor, type DrawCtx } from './drawCircuit';

export type Tool =
  | { mode: 'select' }
  | { mode: 'wire' }
  | { mode: 'place'; kind: ComponentKind; preset?: Partial<CircuitComponent>; name?: string };
export type Selection = { type: 'component' | 'wire'; id: string } | null;

interface Props {
  circuit: Circuit;
  sim: LiveSimulator;
  /** pushHistory=true: record the previous circuit for undo. */
  onChange: (next: Circuit, pushHistory: boolean) => void;
  tool: Tool;
  onToolChange: (t: Tool) => void;
  selection: Selection;
  onSelect: (s: Selection) => void;
  /** Bump to re-fit the camera to the circuit. */
  fitKey: number;
  /** Simulation ticks (gate delays) per second. */
  ticksPerSecond?: number;
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; cx: number; cy: number }
  | { kind: 'move'; id: string; start: Point; base: Circuit; pushed: boolean; moved: boolean; isSwitch: boolean; isClock: boolean }
  | { kind: 'wireDrag'; start: Point; cur: Point; vf: boolean | null }
  | null;

interface Hover {
  gx: number;
  gy: number;
  sx: number;
  sy: number;
  pin: { componentId: string; pinId: string } | null;
  wireId: string | null;
  componentId: string | null;
}

// ------------------------------------------------------------- pure helpers
function dragWireEnd(points: Point[], idx: number, dx: number, dy: number): Point[] {
  const pts = points.map((p) => ({ ...p }));
  const n = pts.length;
  if (n === 2) {
    const fixed = idx === 0 ? pts[1] : pts[0];
    const moved = { x: pts[idx].x + dx, y: pts[idx].y + dy };
    const wasVertical = pts[0].x === pts[1].x;
    const route = lRoute(fixed, moved, wasVertical);
    return idx === 0 ? route.reverse() : route;
  }
  const nbIdx = idx === 0 ? 1 : n - 2;
  const e = pts[idx];
  const nb = pts[nbIdx];
  const vertical = e.x === nb.x;
  e.x += dx;
  e.y += dy;
  if (vertical) nb.x = e.x;
  else nb.y = e.y;
  return simplifyPath(pts);
}

export function moveComponent(base: Circuit, id: string, dx: number, dy: number): Circuit {
  const comp = base.components.find((c) => c.id === id);
  if (!comp) return base;
  const attached = new Set(pinsOf(comp).map((p) => ptKey(p.x, p.y)));
  return {
    ...base,
    components: base.components.map((c) => (c.id === id ? { ...c, x: c.x + dx, y: c.y + dy } : c)),
    wires: base.wires.map((w) => {
      const n = w.points.length;
      if (n < 2) return w;
      const ma = attached.has(ptKey(w.points[0].x, w.points[0].y));
      const mb = attached.has(ptKey(w.points[n - 1].x, w.points[n - 1].y));
      if (!ma && !mb) return w;
      if (ma && mb) return { ...w, points: w.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
      return { ...w, points: dragWireEnd(w.points, ma ? 0 : n - 1, dx, dy) };
    }),
  };
}

function defaultLabel(kind: ComponentKind, circuit: Circuit): string | undefined {
  const used = new Set(circuit.components.filter((c) => c.kind === kind).map((c) => c.label));
  const pick = (cands: string[]) => cands.find((l) => !used.has(l)) ?? `${cands[0]}${used.size + 1}`;
  if (kind === 'switch') return pick('ABCDEFGHIJKLMNOP'.split(''));
  if (kind === 'led') return pick(['Y', 'Z', 'Q', 'S', 'C', 'P']);
  if (kind === 'readout') return pick(['OUT', 'BUS']);
  if (kind === 'ff') return pick(Array.from({ length: 16 }, (_, i) => `FF${i}`));
  if (kind === 'clock') return pick(['CLK', 'CLK2', 'CLK3']);
  if (kind === 'probe') return pick(Array.from({ length: 20 }, (_, i) => `P${i + 1}`));
  if (kind === 'capacitor') return pick(Array.from({ length: 20 }, (_, i) => `C${i + 1}`));
  if (kind === 'inductor') return pick(Array.from({ length: 20 }, (_, i) => `L${i + 1}`));
  return undefined;
}

export function displayNames(circuit: Circuit): Map<string, string> {
  const counters: Partial<Record<ComponentKind, number>> = {};
  const prefix: Partial<Record<ComponentKind, string>> = { npn: 'Q', resistor: 'R', gate: 'U' };
  const m = new Map<string, string>();
  for (const c of circuit.components) {
    const k = (counters[c.kind] = (counters[c.kind] ?? 0) + 1);
    m.set(c.id, c.label ?? (prefix[c.kind] ? `${prefix[c.kind]}${k}` : componentTitle(c)));
  }
  return m;
}

function circuitBounds(c: Circuit) {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const comp of c.components) {
    const b = worldBounds(comp);
    x0 = Math.min(x0, b.x0);
    y0 = Math.min(y0, b.y0 - 1);
    x1 = Math.max(x1, b.x1);
    y1 = Math.max(y1, b.y1 + 1);
  }
  for (const w of c.wires)
    for (const p of w.points) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

// ------------------------------------------------------------- component
export default function CircuitCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const cam = useRef({ x: -100, y: -60, z: 1.6 }); // z: zoom; screen = grid*GRID_PX*z - cam
  const sim = useRef<LiveSimulator>(props.sim);
  sim.current = props.sim;
  const drag = useRef<Drag>(null);
  const hover = useRef<Hover | null>(null);
  const wireDraft = useRef<{ pts: Point[]; vf: boolean } | null>(null);
  const ghostRot = useRef<Rotation>(0);
  const space = useRef(false);
  const size = useRef({ w: 0, h: 0 });

  // Keep the simulator in sync with edits.
  useEffect(() => {
    props.sim.reload(props.circuit);
  }, [props.circuit, props.sim]);

  // Auto-fit camera.
  useEffect(() => {
    const fit = () => {
      const b = circuitBounds(propsRef.current.circuit);
      const { w, h } = size.current;
      if (!b || !w || !h) return;
      const pad = 2;
      const left = 240; // keep clear of the Tools overlay
      const aw = Math.max(120, w - left);
      const z = Math.max(0.5, Math.min(2.6, Math.min(aw / ((b.x1 - b.x0 + pad * 2) * GRID_PX), h / ((b.y1 - b.y0 + pad * 2) * GRID_PX))));
      const ppu = GRID_PX * z;
      cam.current = { z, x: ((b.x0 + b.x1) / 2) * ppu - (left + aw / 2), y: ((b.y0 + b.y1) / 2) * ppu - h / 2 };
    };
    fit();
    const id = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(id);
  }, [props.fitKey]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let last = performance.now();
    let acc = 0;

    const resize = () => {
      const r = canvas.parentElement!.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      size.current = { w: r.width, h: r.height };
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);
    resize();

    const frame = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      const P = propsRef.current;
      const s = sim.current;
      acc += dt * (P.ticksPerSecond ?? 100);
      let n = 0;
      while (acc >= 1 && n < 40) {
        if (s.shouldAdvance()) s.tick();
        acc -= 1;
        n++;
      }
      if (acc > 40) acc = 0;
      draw(ctx, t / 1000);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----------------------------------------------------------- drawing
  function draw(ctx: CanvasRenderingContext2D, time: number) {
    const P = propsRef.current;
    const { w, h } = size.current;
    const dpr = window.devicePixelRatio || 1;
    const { x: cx, y: cy, z } = cam.current;
    const ppu = GRID_PX * z;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.setTransform(dpr * ppu, 0, 0, dpr * ppu, -cx * dpr, -cy * dpr);
    const d: DrawCtx = { ctx, ppu, time, sim: sim.current };
    drawGrid(d, cx / ppu - 1, cy / ppu - 1, (cx + w) / ppu + 1, (cy + h) / ppu + 1);

    const hv = hover.current;
    const sel = P.selection;
    for (const wire of P.circuit.wires) {
      drawWire(d, wire, sim.current?.wireState(wire.id), sel?.type === 'wire' && sel.id === wire.id, hv?.wireId === wire.id && !hv.pin);
    }
    if (sim.current) {
      const cc = sim.current.compiled;
      for (const j of cc.junctions) {
        // colour the dot with any wire passing there
        const wire = P.circuit.wires.find((wr) => wr.points.some((p, i) => i + 1 < wr.points.length && onSegment(j, p, wr.points[i + 1])));
        drawJunction(d, j, netColor(wire ? sim.current.wireState(wire.id) : undefined));
      }
    }
    for (const c of P.circuit.components) {
      drawComponent(d, c, {
        selected: sel?.type === 'component' && sel.id === c.id,
        hoverPin: hv?.pin?.componentId === c.id ? hv.pin.pinId : null,
      });
    }
    drawProbeTags(ctx, P.circuit);

    // Previews
    if (hv && P.tool.mode === 'place') {
      drawComponent(
        d,
        { id: '__ghost', kind: P.tool.kind, x: Math.round(hv.gx), y: Math.round(hv.gy), rot: ghostRot.current, bits: 1, ...P.tool.preset },
        { ghost: true },
      );
    }
    const previewPath = (pts: Point[]) => {
      ctx.strokeStyle = COLORS.strong;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 0.13;
      ctx.setLineDash([0.3, 0.2]);
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    };
    const dr = drag.current;
    if (dr?.kind === 'wireDrag') previewPath(lRoute(dr.start, dr.cur, dr.vf ?? false));
    const wd = wireDraft.current;
    if (wd && hv) {
      const lastPt = wd.pts[wd.pts.length - 1];
      previewPath([...wd.pts, ...lRoute(lastPt, { x: Math.round(hv.gx), y: Math.round(hv.gy) }, wd.vf).slice(1)]);
    }
    if (hv && (P.tool.mode === 'wire' || dr?.kind === 'wireDrag')) {
      ctx.strokeStyle = COLORS.strong;
      ctx.lineWidth = 0.06;
      ctx.strokeRect(Math.round(hv.gx) - 0.3, Math.round(hv.gy) - 0.3, 0.6, 0.6);
    }
    updateTooltip();
  }

  /** Small cyan tags marking signals pinned to the timing diagram. */
  function drawProbeTags(ctx: CanvasRenderingContext2D, C: Circuit) {
    for (const p of C.probes ?? []) {
      let at: Point | null = null;
      if (p.target.type === 'pin') {
        const t = p.target;
        const comp = C.components.find((c) => c.id === t.componentId);
        const pin = comp && pinsOf(comp).find((q) => q.id === t.pinId);
        if (pin) at = { x: pin.x, y: pin.y };
      } else {
        const t = p.target;
        const w = C.wires.find((x) => x.id === t.wireId);
        if (w && w.points.length > 1) at = { x: (w.points[0].x + w.points[1].x) / 2, y: (w.points[0].y + w.points[1].y) / 2 };
      }
      if (!at) continue;
      ctx.save();
      ctx.translate(at.x + 0.25, at.y - 0.45);
      ctx.scale(0.05, 0.05);
      ctx.font = '13px VT323, monospace';
      const w = ctx.measureText(p.label).width + 8;
      ctx.fillStyle = 'rgba(77,232,255,0.16)';
      ctx.strokeStyle = '#4de8ff';
      ctx.lineWidth = 1;
      ctx.fillRect(0, -9, w, 13);
      ctx.strokeRect(0, -9, w, 13);
      ctx.fillStyle = '#4de8ff';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.label, 4, -2.5);
      ctx.restore();
    }
  }

  function updateTooltip() {
    const tip = tipRef.current;
    if (!tip) return;
    const hv = hover.current;
    const P = propsRef.current;
    const s = sim.current;
    let html = '';
    if (hv && s && !drag.current) {
      const names = displayNames(P.circuit);
      if (hv.pin) {
        const comp = P.circuit.components.find((c) => c.id === hv.pin!.componentId);
        const pin = comp && pinsOf(comp).find((p) => p.id === hv.pin!.pinId);
        if (comp && pin) {
          const st = s.pinState(comp.id, pin.id);
          html = `<b>${names.get(comp.id)} · pin ${pin.label}</b><br>${describeNet(st)}`;
        }
      } else if (hv.wireId) {
        html = `<b>Wire</b><br>${describeNet(s.wireState(hv.wireId))}`;
      } else if (hv.componentId) {
        const comp = P.circuit.components.find((c) => c.id === hv.componentId);
        if (comp) {
          let extra = '';
          if (comp.kind === 'npn') extra = `<br>${s.isOn(comp.id) ? 'ON · C–E conducting' : 'OFF · C–E open'}`;
          if (comp.kind === 'ff') {
            const st = s.ffState(comp.id);
            extra = `<br>Q = ${st?.q ? 1 : 0} · Q̄ = ${st?.qn ? 1 : 0} · ${comp.edge === 'falling' ? '↓ falling' : '↑ rising'} edge`;
          }
          if (comp.kind === 'gate') {
            const expr = gateExpression(comp.gateType ?? 'AND', gateInputCount(comp)).html;
            extra = `<br><span style="color:#ffc94a;font-size:13px">${expr}</span><br>Y = ${s.gateOut(comp.id) ? 1 : 0}`;
          }
          if (comp.kind === 'clock') extra = `<br>${comp.freq ?? 1} Hz · level ${s.clockLevel(comp.id) ? 1 : 0}`;
          if (comp.kind === 'npn' || comp.kind === 'pnp') extra = `<br>${s.isOn(comp.id) ? 'DẪN (ON)' : 'NGẮT (OFF)'}`;
          if (comp.kind === 'diode') extra = `<br>${s.diodeOn(comp.id) ? 'Phân cực thuận — dẫn A → K' : 'Không dẫn'}`;
          if (comp.kind === 'capacitor') extra = `<br>Điện tích ${Math.round(s.capCharge(comp.id) * 100)}% · ≈ ${(s.capCharge(comp.id) * 5).toFixed(2)} V · τ = ${((comp.tau ?? 40) / 100).toFixed(2)} s`;
          if (comp.kind === 'inductor') extra = `<br>Dòng ${Math.round(s.indCurrent(comp.id) * 100)}% · τ = ${((comp.tau ?? 40) / 100).toFixed(2)} s`;
          html = `<b>${names.get(comp.id)} · ${componentTitle(comp)}</b><br>${KIND_INFO[comp.kind].hint}${extra}<br><span style="color:#7d86b3">P on a pin/wire = pin to timing diagram</span>`;
        }
      }
    }
    if (html) {
      tip.innerHTML = html;
      tip.style.display = 'block';
      tip.style.left = `${hv!.sx + 16}px`;
      tip.style.top = `${hv!.sy + 16}px`;
    } else tip.style.display = 'none';
  }

  // ----------------------------------------------------------- hit testing
  function toGrid(e: { clientX: number; clientY: number }) {
    const r = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const ppu = GRID_PX * cam.current.z;
    return { sx, sy, gx: (sx + cam.current.x) / ppu, gy: (sy + cam.current.y) / ppu };
  }

  function hitTest(gx: number, gy: number): Omit<Hover, 'gx' | 'gy' | 'sx' | 'sy'> {
    const C = propsRef.current.circuit;
    let pin: Hover['pin'] = null;
    let best = 0.4;
    for (const c of C.components)
      for (const p of pinsOf(c)) {
        const dd = Math.hypot(p.x - gx, p.y - gy);
        if (dd < best) {
          best = dd;
          pin = { componentId: c.id, pinId: p.id };
        }
      }
    let componentId: string | null = null;
    for (let i = C.components.length - 1; i >= 0; i--) {
      const b = worldBounds(C.components[i]);
      if (gx >= b.x0 - 0.1 && gx <= b.x1 + 0.1 && gy >= b.y0 - 0.1 && gy <= b.y1 + 0.1) {
        componentId = C.components[i].id;
        break;
      }
    }
    let wireId: string | null = null;
    let bw = 0.3;
    for (const w of C.wires)
      for (let i = 0; i + 1 < w.points.length; i++) {
        const a = w.points[i];
        const b = w.points[i + 1];
        const px = Math.max(Math.min(a.x, b.x), Math.min(Math.max(a.x, b.x), gx));
        const py = Math.max(Math.min(a.y, b.y), Math.min(Math.max(a.y, b.y), gy));
        const dd = Math.hypot(px - gx, py - gy);
        if (dd < bw) {
          bw = dd;
          wireId = w.id;
        }
      }
    return { pin, componentId, wireId };
  }

  function isConnectionPoint(p: Point) {
    const C = propsRef.current.circuit;
    for (const c of C.components) for (const q of pinsOf(c)) if (q.x === p.x && q.y === p.y) return true;
    for (const w of C.wires) for (let i = 0; i + 1 < w.points.length; i++) if (onSegment(p, w.points[i], w.points[i + 1])) return true;
    return false;
  }

  function addWire(points: Point[]) {
    const pts = simplifyPath(points);
    if (pts.length < 2) return;
    const P = propsRef.current;
    P.onChange({ ...P.circuit, wires: [...P.circuit.wires, { id: newId('w'), points: pts }] }, true);
  }

  function finishDraft() {
    const wd = wireDraft.current;
    wireDraft.current = null;
    if (wd && wd.pts.length >= 2) addWire(wd.pts);
  }

  // ----------------------------------------------------------- events
  useEffect(() => {
    const canvas = canvasRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { sx, sy, gx, gy } = toGrid(e);
      const z = Math.max(0.35, Math.min(5, cam.current.z * Math.exp(-e.deltaY * 0.0015)));
      const ppu = GRID_PX * z;
      cam.current = { z, x: gx * ppu - sx, y: gy * ppu - sy };
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const P = propsRef.current;
      if (e.code === 'Space') {
        space.current = true;
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') {
        if (wireDraft.current) finishDraft();
        else if (P.tool.mode !== 'select') P.onToolChange({ mode: 'select' });
        else P.onSelect(null);
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        if (P.tool.mode === 'place') ghostRot.current = ((ghostRot.current + 1) % 4) as Rotation;
        else if (P.selection?.type === 'component') {
          const id = P.selection.id;
          P.onChange({ ...P.circuit, components: P.circuit.components.map((c) => (c.id === id ? { ...c, rot: ((c.rot + 1) % 4) as Rotation } : c)) }, true);
        }
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        if (wireDraft.current) wireDraft.current.vf = !wireDraft.current.vf;
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && P.selection) {
        const s = P.selection;
        P.onChange(
          s.type === 'component'
            ? {
                ...P.circuit,
                components: P.circuit.components.filter((c) => c.id !== s.id),
                probes: (P.circuit.probes ?? []).filter((p) => !(p.target.type === 'pin' && p.target.componentId === s.id)),
              }
            : {
                ...P.circuit,
                wires: P.circuit.wires.filter((w) => w.id !== s.id),
                probes: (P.circuit.probes ?? []).filter((p) => !(p.target.type === 'wire' && p.target.wireId === s.id)),
              },
          true,
        );
        P.onSelect(null);
        return;
      }
      if (e.key === 'p' || e.key === 'P') {
        const hv = hover.current;
        const target: ProbeTarget | null = hv?.pin
          ? { type: 'pin', componentId: hv.pin.componentId, pinId: hv.pin.pinId }
          : hv?.wireId
            ? { type: 'wire', wireId: hv.wireId }
            : null;
        if (target) P.onChange(toggleProbe(P.circuit, target), true);
        return;
      }
      if (e.key === 'w' || e.key === 'W') P.onToolChange({ mode: 'wire' });
      if (e.key === 'v' || e.key === 'V') P.onToolChange({ mode: 'select' });
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);
    const P = propsRef.current;
    const g = toGrid(e);
    const snap = { x: Math.round(g.gx), y: Math.round(g.gy) };
    if (e.button === 1 || (e.button === 0 && space.current)) {
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cx: cam.current.x, cy: cam.current.y };
      return;
    }
    if (e.button === 2) {
      if (wireDraft.current) finishDraft();
      else if (P.tool.mode !== 'select') P.onToolChange({ mode: 'select' });
      return;
    }
    if (e.button !== 0) return;

    if (P.tool.mode === 'place') {
      const kind = P.tool.kind;
      const comp: CircuitComponent = {
        id: newId(kind),
        kind,
        x: snap.x,
        y: snap.y,
        rot: ghostRot.current,
        label: defaultLabel(kind, P.circuit),
        ...(kind === 'switch' ? { on: false } : {}),
        ...(kind === 'readout' ? { bits: 1 } : {}),
        ...(kind === 'clock' ? { freq: 1 } : {}),
        ...(kind === 'ff' ? { ffType: 'D' as const, edge: 'rising' as const, asyncActiveLow: true, initQ: 0 as const } : {}),
        ...(kind === 'gate' ? { gateType: 'AND' as const, inputs: 2 } : {}),
        ...(kind === 'capacitor' || kind === 'inductor' ? { tau: 40 } : {}),
        ...P.tool.preset,
      };
      // A probe part pins itself to the timing diagram.
      const probes =
        kind === 'probe'
          ? [...(P.circuit.probes ?? []), { id: newId('p'), label: comp.label ?? 'P', target: { type: 'pin' as const, componentId: comp.id, pinId: 'in' } }]
          : P.circuit.probes;
      P.onChange({ ...P.circuit, components: [...P.circuit.components, comp], probes }, true);
      P.onSelect({ type: 'component', id: comp.id });
      return;
    }

    if (P.tool.mode === 'wire') {
      const wd = wireDraft.current;
      if (!wd) {
        wireDraft.current = { pts: [snap], vf: false };
        return;
      }
      const lastPt = wd.pts[wd.pts.length - 1];
      if (lastPt.x === snap.x && lastPt.y === snap.y) {
        finishDraft();
        return;
      }
      wd.pts = simplifyPath([...wd.pts, ...lRoute(lastPt, snap, wd.vf).slice(1)]);
      if (isConnectionPoint(snap)) finishDraft();
      return;
    }

    // select mode
    const hit = hitTest(g.gx, g.gy);
    if (hit.pin) {
      const comp = P.circuit.components.find((c) => c.id === hit.pin!.componentId)!;
      const pin = pinsOf(comp).find((p) => p.id === hit.pin!.pinId)!;
      drag.current = { kind: 'wireDrag', start: { x: pin.x, y: pin.y }, cur: { x: pin.x, y: pin.y }, vf: null };
      return;
    }
    if (hit.componentId) {
      const comp = P.circuit.components.find((c) => c.id === hit.componentId)!;
      P.onSelect({ type: 'component', id: comp.id });
      drag.current = {
        kind: 'move',
        id: comp.id,
        start: snap,
        base: P.circuit,
        pushed: false,
        moved: false,
        isSwitch: comp.kind === 'switch',
        isClock: comp.kind === 'clock',
      };
      return;
    }
    if (hit.wireId) {
      P.onSelect({ type: 'wire', id: hit.wireId });
      // Start a branch wire from the clicked grid point.
      drag.current = { kind: 'wireDrag', start: snap, cur: snap, vf: null };
      return;
    }
    P.onSelect(null);
    drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cx: cam.current.x, cy: cam.current.y };
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = toGrid(e);
    hover.current = { ...g, ...hitTest(g.gx, g.gy) };
    const dr = drag.current;
    const canvas = canvasRef.current!;
    const P = propsRef.current;
    if (!dr) {
      canvas.style.cursor =
        P.tool.mode !== 'select' ? 'crosshair' : space.current ? 'grab' : hover.current.pin ? 'crosshair' : hover.current.componentId ? 'move' : 'default';
      return;
    }
    if (dr.kind === 'pan') {
      canvas.style.cursor = 'grabbing';
      cam.current = { ...cam.current, x: dr.cx - (e.clientX - dr.sx), y: dr.cy - (e.clientY - dr.sy) };
    } else if (dr.kind === 'wireDrag') {
      dr.cur = { x: Math.round(g.gx), y: Math.round(g.gy) };
      if (dr.vf === null) {
        const dx = Math.abs(dr.cur.x - dr.start.x);
        const dy = Math.abs(dr.cur.y - dr.start.y);
        if (dx !== dy) dr.vf = dy > dx;
      }
    } else if (dr.kind === 'move') {
      const dx = Math.round(g.gx) - dr.start.x;
      const dy = Math.round(g.gy) - dr.start.y;
      if (dx === 0 && dy === 0 && !dr.moved) return;
      dr.moved = true;
      P.onChange(moveComponent(dr.base, dr.id, dx, dy), !dr.pushed);
      dr.pushed = true;
    }
  }

  function onPointerUp() {
    const dr = drag.current;
    drag.current = null;
    const P = propsRef.current;
    if (!dr) return;
    if (dr.kind === 'wireDrag') {
      if (dr.cur.x !== dr.start.x || dr.cur.y !== dr.start.y) addWire(lRoute(dr.start, dr.cur, dr.vf ?? false));
    } else if (dr.kind === 'move' && !dr.moved && dr.isSwitch) {
      P.onChange({ ...P.circuit, components: P.circuit.components.map((c) => (c.id === dr.id ? { ...c, on: !c.on } : c)) }, true);
    } else if (dr.kind === 'move' && !dr.moved && dr.isClock) {
      sim.current.toggleClock(dr.id);
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => (hover.current = null)}
        onDoubleClick={() => wireDraft.current && finishDraft()}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div
        ref={tipRef}
        className="pointer-events-none absolute z-10 hidden max-w-xs rounded border border-edge bg-panel/95 px-2 py-1 font-mono text-[11px] leading-snug text-slate-200 shadow-lg"
      />
    </div>
  );
}
