// Canvas 2D renderers. The context is pre-transformed so 1 unit = 1 grid cell.
import type { CircuitComponent, NetState, Point, Wire } from '../types/circuit';
import { clampBits, ffDataPins, gateGeometry, gateInputCount, pinsOf, rotate, worldBounds } from '../engine/componentDefs';
import type { LiveSimulator } from '../engine/simulator';

export const COLORS = {
  bg: '#0f1221',
  dot: '#1f2542',
  major: '#171c33',
  strong: '#ffc94a', // HIGH, strongly driven
  weak: '#4de8ff', // HIGH through a resistor
  low: '#3b4466',
  float: '#59607a',
  bad: '#ff4d5e',
  body: '#161a2e',
  edge: '#4a5488',
  text: '#c9d1ff',
  muted: '#7d86b3',
  select: '#ffffff',
};

export function netColor(s: NetState | undefined): string {
  if (!s) return COLORS.float;
  if (s.level === 'X') return COLORS.bad;
  if (s.level === 'H') return s.strength === 'strong' ? COLORS.strong : COLORS.weak;
  if (s.level === 'L') return COLORS.low;
  return COLORS.float;
}
const isHigh = (s?: NetState) => s?.level === 'H';

export interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  /** screen pixels per grid unit (for glow sizes) */
  ppu: number;
  time: number;
  sim: LiveSimulator | null;
}

function glow(d: DrawCtx, color: string, amount: number) {
  d.ctx.shadowColor = color;
  d.ctx.shadowBlur = amount * d.ppu;
}
function noGlow(d: DrawCtx) {
  d.ctx.shadowBlur = 0;
}

function seg(d: DrawCtx, x1: number, y1: number, x2: number, y2: number, color: string, w: number, lit = false) {
  const { ctx } = d;
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  if (lit) glow(d, color, 0.45);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  noGlow(d);
}

function text(d: DrawCtx, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center') {
  // Draw at 20x scale to avoid sub-pixel font sizes inside the grid transform.
  const { ctx } = d;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(0.05, 0.05);
  ctx.fillStyle = color;
  ctx.font = `${Math.round(size * 20)}px VT323, "JetBrains Mono", monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, 0, 0);
  ctx.restore();
}

/** Text with an optional overbar (Q̄, PRĒ, CLR̄). */
function textBar(d: DrawCtx, s: string, x: number, y: number, size: number, color: string, bar: boolean, align: CanvasTextAlign = 'center') {
  text(d, s, x, y, size, color, align);
  if (!bar) return;
  const { ctx } = d;
  ctx.save();
  ctx.font = `${Math.round(size * 20)}px VT323, "JetBrains Mono", monospace`;
  const w = ctx.measureText(s).width * 0.05;
  ctx.restore();
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.fillStyle = color;
  ctx.fillRect(x0, y - size * 0.42, w, 0.07);
}

function bubble(d: DrawCtx, x: number, y: number, r: number, color: string) {
  const { ctx } = d;
  ctx.fillStyle = '#0f1221';
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.09;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

// ------------------------------------------------------------------ grid
export function drawGrid(d: DrawCtx, x0: number, y0: number, x1: number, y1: number) {
  const { ctx } = d;
  if (d.ppu >= 9) {
    ctx.fillStyle = COLORS.dot;
    const r = 1.6 / d.ppu;
    for (let x = Math.floor(x0); x <= x1; x++)
      for (let y = Math.floor(y0); y <= y1; y++) ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.strokeStyle = COLORS.major;
  ctx.lineWidth = 1 / d.ppu;
  ctx.beginPath();
  for (let x = Math.floor(x0 / 5) * 5; x <= x1; x += 5) {
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
  }
  for (let y = Math.floor(y0 / 5) * 5; y <= y1; y += 5) {
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
  }
  ctx.stroke();
}

// ------------------------------------------------------------------ wires
export function polylineLength(pts: Point[]) {
  let L = 0;
  for (let i = 0; i + 1 < pts.length; i++) L += Math.abs(pts[i + 1].x - pts[i].x) + Math.abs(pts[i + 1].y - pts[i].y);
  return L;
}
function pointAlong(pts: Point[], t: number): Point {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const l = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (t <= l || i + 2 === pts.length) {
      const f = l === 0 ? 0 : Math.min(1, t / l);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    t -= l;
  }
  return pts[pts.length - 1];
}

export function drawWire(d: DrawCtx, w: Wire, state: NetState | undefined, selected: boolean, hovered: boolean) {
  const { ctx } = d;
  if (w.points.length < 2) return;
  const color = netColor(state);
  const lit = isHigh(state);
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(w.points[0].x, w.points[0].y);
    for (const p of w.points.slice(1)) ctx.lineTo(p.x, p.y);
  };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (selected || hovered) {
    ctx.strokeStyle = selected ? COLORS.select : '#8fa0ff';
    ctx.lineWidth = 0.36;
    ctx.globalAlpha = selected ? 0.55 : 0.3;
    path();
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = lit ? 0.17 : 0.13;
  if (state?.level === 'Z') ctx.setLineDash([0.25, 0.2]);
  if (lit) glow(d, color, 0.6);
  path();
  ctx.stroke();
  noGlow(d);
  ctx.setLineDash([]);

  // Moving pulse dots on HIGH wires.
  if (lit) {
    const L = polylineLength(w.points);
    const gap = 1.6;
    const off = (d.time * 3.2) % gap;
    ctx.fillStyle = '#fff8e0';
    glow(d, color, 0.5);
    for (let t = off; t < L; t += gap) {
      const p = pointAlong(w.points, t);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    noGlow(d);
  }
}

export function drawJunction(d: DrawCtx, p: Point, color: string) {
  d.ctx.fillStyle = color;
  d.ctx.beginPath();
  d.ctx.arc(p.x, p.y, 0.2, 0, Math.PI * 2);
  d.ctx.fill();
}

// ------------------------------------------------------------------ components
export interface CompDrawOpts {
  selected?: boolean;
  ghost?: boolean;
  hoverPin?: string | null;
}

export function drawComponent(d: DrawCtx, c: CircuitComponent, o: CompDrawOpts = {}) {
  const { ctx, sim } = d;
  const ps = (pin: string) => (o.ghost ? undefined : sim?.pinState(c.id, pin));
  ctx.save();
  if (o.ghost) ctx.globalAlpha = 0.5;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';

  // Body in the rotated local frame.
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate((c.rot * Math.PI) / 2);
  switch (c.kind) {
    case 'vcc': {
      const col = '#ff6b7d';
      seg(d, 0, 0, 0, -0.8, netColor(ps('out')), 0.14, isHigh(ps('out')));
      ctx.fillStyle = col;
      ctx.fillRect(-0.7, -1.0, 1.4, 0.22);
      ctx.fillRect(-0.09, -1.55, 0.18, 0.4);
      ctx.fillRect(-0.25, -1.44, 0.5, 0.18);
      break;
    }
    case 'gnd': {
      const col = '#6f86ff';
      seg(d, 0, 0, 0, 0.55, netColor(ps('in')), 0.14);
      ctx.fillStyle = col;
      ctx.fillRect(-0.7, 0.55, 1.4, 0.16);
      ctx.fillRect(-0.45, 0.85, 0.9, 0.16);
      ctx.fillRect(-0.2, 1.15, 0.4, 0.16);
      break;
    }
    case 'switch': {
      const on = !!c.on;
      seg(d, 0.4, 0, 1, 0, netColor(ps('out')), 0.14, on);
      ctx.fillStyle = on ? '#2e2810' : '#0b0e1c';
      ctx.strokeStyle = on ? COLORS.strong : COLORS.edge;
      ctx.lineWidth = 0.1;
      ctx.fillRect(-1.6, -0.7, 2, 1.4);
      ctx.strokeRect(-1.6, -0.7, 2, 1.4);
      // slider track + knob
      ctx.fillStyle = '#0a0c17';
      ctx.fillRect(-1.35, -0.18, 1.5, 0.36);
      ctx.fillStyle = on ? COLORS.strong : '#5a638f';
      if (on) glow(d, COLORS.strong, 0.5);
      ctx.fillRect(on ? -0.35 : -1.35, -0.32, 0.5, 0.64);
      noGlow(d);
      break;
    }
    case 'resistor': {
      seg(d, -2, 0, -1.2, 0, netColor(ps('A')), 0.14, isHigh(ps('A')));
      seg(d, 1.2, 0, 2, 0, netColor(ps('B')), 0.14, isHigh(ps('B')));
      ctx.strokeStyle = '#d8b46a';
      ctx.lineWidth = 0.12;
      ctx.lineJoin = 'miter';
      ctx.beginPath();
      ctx.moveTo(-1.2, 0);
      for (let i = 0; i < 6; i++) ctx.lineTo(-1 + i * 0.4, i % 2 ? 0.38 : -0.38);
      ctx.lineTo(1.2, 0);
      ctx.stroke();
      break;
    }
    case 'npn': {
      const on = !o.ghost && !!sim?.isOn(c.id);
      const bS = ps('B');
      const cS = ps('C');
      const eS = ps('E');
      ctx.fillStyle = '#12162a';
      ctx.strokeStyle = on ? COLORS.strong : COLORS.edge;
      ctx.lineWidth = 0.1;
      if (on) glow(d, COLORS.strong, 0.6);
      ctx.beginPath();
      ctx.arc(0, 0, 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      noGlow(d);
      seg(d, -2, 0, -0.45, 0, netColor(bS), 0.14, isHigh(bS));
      seg(d, -0.45, -0.6, -0.45, 0.6, on ? COLORS.strong : COLORS.edge, 0.16, on);
      const chan = on ? COLORS.strong : COLORS.edge;
      seg(d, -0.45, -0.28, 0, -0.75, cS && isHigh(cS) ? netColor(cS) : chan, 0.12, on);
      seg(d, 0, -0.75, 0, -2, netColor(cS), 0.14, isHigh(cS));
      seg(d, -0.45, 0.28, 0, 0.75, chan, 0.12, on);
      seg(d, 0, 0.75, 0, 2, netColor(eS), 0.14, isHigh(eS));
      // emitter arrow
      ctx.fillStyle = chan;
      ctx.beginPath();
      ctx.moveTo(0, 0.75);
      ctx.lineTo(-0.32, 0.62);
      ctx.lineTo(-0.1, 0.42);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'pnp': {
      const on = !o.ghost && !!sim?.isOn(c.id);
      const bS = ps('B');
      const eS = ps('E');
      const cS = ps('C');
      ctx.fillStyle = '#12162a';
      ctx.strokeStyle = on ? COLORS.strong : COLORS.edge;
      ctx.lineWidth = 0.1;
      if (on) glow(d, COLORS.strong, 0.6);
      ctx.beginPath();
      ctx.arc(0, 0, 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      noGlow(d);
      const chan = on ? COLORS.strong : COLORS.edge;
      seg(d, -2, 0, -0.45, 0, netColor(bS), 0.14, isHigh(bS));
      seg(d, -0.45, -0.6, -0.45, 0.6, chan, 0.16, on);
      seg(d, -0.45, -0.28, 0, -0.75, chan, 0.12, on);
      seg(d, 0, -0.75, 0, -2, netColor(eS), 0.14, isHigh(eS));
      seg(d, -0.45, 0.28, 0, 0.75, chan, 0.12, on);
      seg(d, 0, 0.75, 0, 2, netColor(cS), 0.14, isHigh(cS));
      // emitter arrow points INTO the base (PNP)
      ctx.fillStyle = chan;
      ctx.beginPath();
      ctx.moveTo(-0.42, -0.3);
      ctx.lineTo(-0.1, -0.38);
      ctx.lineTo(-0.28, -0.62);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'diode': {
      const on = !o.ghost && !!sim?.diodeOn(c.id);
      const aS = ps('A');
      const kS = ps('K');
      seg(d, -2, 0, -0.6, 0, netColor(aS), 0.14, isHigh(aS));
      seg(d, 0.55, 0, 2, 0, netColor(kS), 0.14, isHigh(kS));
      const col = on ? COLORS.strong : '#9aa5e6';
      ctx.fillStyle = on ? '#3a3216' : '#12162a';
      ctx.strokeStyle = col;
      ctx.lineWidth = 0.1;
      if (on) glow(d, COLORS.strong, 0.5);
      ctx.beginPath();
      ctx.moveTo(-0.6, -0.55);
      ctx.lineTo(0.5, 0);
      ctx.lineTo(-0.6, 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      noGlow(d);
      ctx.fillStyle = col;
      ctx.fillRect(0.5, -0.58, 0.12, 1.16);
      break;
    }
    case 'capacitor':
    case 'inductor': {
      const isCap = c.kind === 'capacitor';
      const aS = ps('A');
      const bS = ps('B');
      const val = o.ghost ? 0 : isCap ? sim?.capCharge(c.id) ?? 0 : sim?.indCurrent(c.id) ?? 0;
      const col = val >= 0.5 ? COLORS.weak : '#9aa5e6';
      if (isCap) {
        seg(d, -2, 0, -0.28, 0, netColor(aS), 0.14, isHigh(aS));
        seg(d, 0.28, 0, 2, 0, netColor(bS), 0.14, isHigh(bS));
        ctx.fillStyle = col;
        if (val > 0.05) glow(d, COLORS.weak, 0.4 * val);
        ctx.fillRect(-0.34, -0.75, 0.14, 1.5);
        ctx.fillRect(0.2, -0.75, 0.14, 1.5);
        noGlow(d);
      } else {
        seg(d, -2, 0, -1.2, 0, netColor(aS), 0.14, isHigh(aS));
        seg(d, 1.2, 0, 2, 0, netColor(bS), 0.14, isHigh(bS));
        ctx.strokeStyle = col;
        ctx.lineWidth = 0.12;
        if (val > 0.05) glow(d, COLORS.weak, 0.4 * val);
        ctx.beginPath();
        for (let i = 0; i < 4; i++) ctx.arc(-0.9 + i * 0.6, 0, 0.3, Math.PI, 0);
        ctx.stroke();
        noGlow(d);
      }
      // charge / current bar
      ctx.fillStyle = '#0a0c17';
      ctx.fillRect(-1.2, 0.95, 2.4, 0.26);
      ctx.fillStyle = val >= 0.5 ? COLORS.weak : '#4a5488';
      ctx.fillRect(-1.2, 0.95, 2.4 * Math.max(0, Math.min(1, val)), 0.26);
      ctx.strokeStyle = '#2a3160';
      ctx.lineWidth = 0.05;
      ctx.strokeRect(-1.2, 0.95, 2.4, 0.26);
      ctx.fillStyle = '#c9d1ff';
      ctx.fillRect(-0.01, 0.9, 0.03, 0.36); // 50 % threshold mark
      break;
    }
    case 'probe': {
      const s = ps('in');
      seg(d, -1, 0, -0.6, 0, netColor(s), 0.14, isHigh(s));
      const col = netColor(s);
      ctx.fillStyle = '#07080f';
      ctx.strokeStyle = col;
      ctx.lineWidth = 0.1;
      if (isHigh(s)) glow(d, col, 0.5);
      ctx.fillRect(-0.6, -0.6, 2.2, 1.2);
      ctx.strokeRect(-0.6, -0.6, 2.2, 1.2);
      noGlow(d);
      break;
    }
    case 'led': {
      const s = ps('in');
      const lit = isHigh(s);
      seg(d, -1, 0, -0.55, 0, netColor(s), 0.14, lit);
      ctx.fillStyle = lit ? '#ff4d6d' : '#3a1626';
      if (lit) glow(d, '#ff4d6d', 1.4);
      ctx.beginPath();
      ctx.arc(0, 0, 0.58, 0, Math.PI * 2);
      ctx.fill();
      noGlow(d);
      ctx.fillStyle = lit ? '#ffd6dc' : '#5a2a3a';
      ctx.fillRect(-0.3, -0.3, 0.2, 0.2);
      // pixel rays
      if (lit) {
        ctx.fillStyle = '#ffb3c0';
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3 + d.time * 0.6;
          ctx.fillRect(Math.cos(a) * 0.9 - 0.06, Math.sin(a) * 0.9 - 0.06, 0.12, 0.12);
        }
      }
      break;
    }
    case 'readout': {
      const n = clampBits(c.bits);
      for (let i = 0; i < n; i++) seg(d, -1, i, -0.5, i, netColor(ps(`D${i}`)), 0.14, isHigh(ps(`D${i}`)));
      ctx.fillStyle = '#070912';
      ctx.strokeStyle = '#3a3320';
      ctx.lineWidth = 0.1;
      ctx.fillRect(-0.5, -0.7, 8, n + 0.4);
      ctx.strokeRect(-0.5, -0.7, 8, n + 0.4);
      break;
    }
    case 'gate': {
      const type = c.gateType ?? 'AND';
      const outS = ps('OUT');
      const hi = isHigh(outS);
      const edge = hi ? COLORS.strong : '#8b96d8';
      const pins = pinsOf({ ...c, x: 0, y: 0, rot: 0 });
      const { half: h, outX } = gateGeometry(gateInputCount(c));
      const isOr = type === 'OR' || type === 'NOR' || type === 'XOR' || type === 'XNOR';
      const isX = type === 'XOR' || type === 'XNOR';
      for (const p of pins.filter((q) => q.id !== 'OUT')) {
        const s = ps(p.id);
        // OR back curve: x(y) ≈ -1.2 + 0.65·(1 - (y/h)²)
        const backX = isOr ? -1.2 + 0.65 * (1 - (p.dy / h) ** 2) - (isX ? 0.35 : 0) : -1.2;
        seg(d, -2, p.dy, backX, p.dy, netColor(s), 0.12, isHigh(s));
      }
      const inv = type === 'NAND' || type === 'NOR' || type === 'NOT' || type === 'XNOR';
      const tip = type === 'NOT' ? 1.5 : 0.5 + h;
      seg(d, inv ? tip + 0.4 : tip, 0, outX, 0, netColor(outS), 0.14, hi);
      ctx.fillStyle = '#12162a';
      ctx.strokeStyle = edge;
      ctx.lineWidth = 0.11;
      if (hi) glow(d, COLORS.strong, 0.4);
      ctx.beginPath();
      if (type === 'NOT') {
        ctx.moveTo(-1.2, -1.1);
        ctx.lineTo(1.5, 0);
        ctx.lineTo(-1.2, 1.1);
        ctx.closePath();
      } else if (isOr) {
        ctx.moveTo(-1.2, -h);
        ctx.quadraticCurveTo(tip - 1.1, -h, tip, 0);
        ctx.quadraticCurveTo(tip - 1.1, h, -1.2, h);
        ctx.quadraticCurveTo(0.1, 0, -1.2, -h);
      } else {
        ctx.moveTo(-1.2, -h);
        ctx.lineTo(0.5, -h);
        ctx.arc(0.5, 0, h, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(-1.2, h);
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();
      noGlow(d);
      if (isX) {
        ctx.beginPath();
        ctx.moveTo(-1.55, -h);
        ctx.quadraticCurveTo(-0.25, 0, -1.55, h);
        ctx.stroke();
      }
      if (inv) bubble(d, tip + 0.2, 0, 0.2, edge);
      break;
    }
    case 'clock': {
      const hi = !o.ghost && !!sim?.clockLevel(c.id);
      seg(d, 1.2, 0, 2, 0, netColor(ps('out')), 0.14, hi);
      ctx.fillStyle = hi ? '#2e2810' : '#0b0e1c';
      ctx.strokeStyle = hi ? COLORS.strong : COLORS.edge;
      ctx.lineWidth = 0.1;
      if (hi) glow(d, COLORS.strong, 0.5);
      ctx.fillRect(-1.5, -0.9, 2.7, 1.8);
      ctx.strokeRect(-1.5, -0.9, 2.7, 1.8);
      noGlow(d);
      ctx.strokeStyle = hi ? COLORS.strong : '#8b96d8';
      ctx.lineWidth = 0.1;
      ctx.beginPath();
      ctx.moveTo(-1.2, 0.45);
      ctx.lineTo(-0.7, 0.45);
      ctx.lineTo(-0.7, -0.45);
      ctx.lineTo(0, -0.45);
      ctx.lineTo(0, 0.45);
      ctx.lineTo(0.6, 0.45);
      ctx.lineTo(0.6, -0.45);
      ctx.lineTo(0.95, -0.45);
      ctx.stroke();
      break;
    }
    case 'ff': {
      const st = o.ghost ? undefined : sim?.ffState(c.id);
      const q = !!st?.q;
      const lowAct = c.asyncActiveLow ?? true;
      const falling = (c.edge ?? 'rising') === 'falling';
      const pins = pinsOf({ ...c, x: 0, y: 0, rot: 0 });
      for (const p of pins) {
        const s = ps(p.id);
        const col = netColor(s);
        const lit = isHigh(s);
        if (p.dx < 0) seg(d, -3, p.dy, p.id === 'CLK' && falling ? -2.5 : -2, p.dy, col, 0.12, lit);
        else if (p.dx > 0) seg(d, 2, p.dy, 3, p.dy, col, 0.12, lit);
        else if (p.dy < 0) seg(d, 0, -4, 0, lowAct ? -3.5 : -3, col, 0.12, lit);
        else seg(d, 0, 4, 0, lowAct ? 3.5 : 3, col, 0.12, lit);
      }
      ctx.fillStyle = '#12162a';
      ctx.strokeStyle = q ? COLORS.strong : '#8b96d8';
      ctx.lineWidth = 0.12;
      if (q) glow(d, COLORS.strong, 0.35);
      ctx.fillRect(-2, -3, 4, 6);
      ctx.strokeRect(-2, -3, 4, 6);
      noGlow(d);
      // clock triangle
      ctx.strokeStyle = '#c9d1ff';
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      ctx.moveTo(-2, -0.45);
      ctx.lineTo(-1.45, 0);
      ctx.lineTo(-2, 0.45);
      ctx.stroke();
      if (falling) bubble(d, -2.25, 0, 0.25, '#c9d1ff');
      if (lowAct) {
        bubble(d, 0, -3.25, 0.25, '#c9d1ff');
        bubble(d, 0, 3.25, 0.25, '#c9d1ff');
      }
      break;
    }
    case 'ic':
      ctx.strokeStyle = COLORS.edge;
      ctx.strokeRect(-1, -1, 2, 2);
      break;
  }
  ctx.restore();

  // Texts in world frame (never upside down).
  const at = (dx: number, dy: number) => {
    const r = rotate(dx, dy, c.rot);
    return { x: c.x + r.x, y: c.y + r.y };
  };
  switch (c.kind) {
    case 'vcc': {
      const p = at(0, -2.05);
      text(d, 'VCC 5V', p.x, p.y, 0.75, '#ff9aa6');
      break;
    }
    case 'gnd': {
      const p = at(0, 1.9);
      text(d, 'GND', p.x, p.y, 0.75, '#9fb0ff');
      break;
    }
    case 'switch': {
      const p = at(-0.6, -1.15);
      text(d, `${c.label ?? 'IN'} = ${c.on ? 1 : 0}`, p.x, p.y, 0.8, c.on ? COLORS.strong : COLORS.text);
      break;
    }
    case 'led': {
      const p = at(0, -1.2);
      text(d, c.label ?? 'LED', p.x, p.y, 0.8, COLORS.text);
      break;
    }
    case 'npn':
    case 'pnp': {
      for (const pin of pinsOf(c)) {
        const off = pin.id === 'B' ? at(-1.4, -0.45) : at(0.45, pin.dy < 0 ? -1.5 : 1.5);
        text(d, pin.label, off.x, off.y, 0.6, COLORS.muted);
      }
      if (c.kind === 'pnp') {
        const p = at(0.55, 0.05);
        text(d, 'P', p.x, p.y, 0.55, COLORS.muted);
      }
      break;
    }
    case 'diode': {
      const a = at(-1.3, -0.55);
      const k = at(1.3, -0.55);
      text(d, 'A', a.x, a.y, 0.55, COLORS.muted);
      text(d, 'K', k.x, k.y, 0.55, COLORS.muted);
      break;
    }
    case 'capacitor':
    case 'inductor': {
      const isCap = c.kind === 'capacitor';
      const val = o.ghost ? 0 : isCap ? sim?.capCharge(c.id) ?? 0 : sim?.indCurrent(c.id) ?? 0;
      const p = at(0, 1.55);
      text(d, `${isCap ? 'C' : 'L'} ${Math.round(val * 100)}%`, p.x, p.y, 0.6, val >= 0.5 ? COLORS.weak : COLORS.muted);
      const l = at(0, -1.15);
      text(d, `${c.label ?? (isCap ? 'C' : 'L')} τ=${((c.tau ?? 40) * 10) / 1000}s`, l.x, l.y, 0.55, COLORS.muted);
      break;
    }
    case 'probe': {
      const s = o.ghost ? undefined : sim?.pinState(c.id, 'in');
      const ch = !s ? '?' : s.level === 'H' ? '1' : s.level === 'L' ? '0' : s.level;
      const p = at(0.5, 0.02);
      text(d, ch, p.x, p.y, 1.0, s ? netColor(s) : COLORS.muted);
      const l = at(0.5, -1.0);
      text(d, c.label ?? 'P', l.x, l.y, 0.6, COLORS.weak);
      break;
    }
    case 'gate': {
      const type = c.gateType ?? 'AND';
      const n = gateInputCount(c);
      const { half } = gateGeometry(n);
      const p = at(type === 'NOT' ? 0 : 0.35, 0);
      text(d, `${type}${type !== 'NOT' && n > 2 ? n : ''}`, p.x, p.y, type.length > 3 ? 0.62 : 0.7, '#9aa5e6');
      if (c.label) {
        const l = at(0.4, -half - 0.55);
        text(d, c.label, l.x, l.y, 0.7, COLORS.muted);
      }
      break;
    }
    case 'clock': {
      const p = at(-0.15, -1.55);
      text(d, `${c.label ?? 'CLK'} ${c.freq ?? 1}Hz`, p.x, p.y, 0.75, sim?.clockLevel(c.id) ? COLORS.strong : COLORS.text);
      break;
    }
    case 'ff': {
      const type = c.ffType ?? 'D';
      const lowAct = c.asyncActiveLow ?? true;
      const st = o.ghost ? undefined : sim?.ffState(c.id);
      const [a, b] = ffDataPins(type);
      const lab = (dx: number, dy: number, s: string, bar: boolean, align: CanvasTextAlign = 'center', size = 0.62) => {
        const p = at(dx, dy);
        textBar(d, s, p.x, p.y, size, '#c9d1ff', bar, c.rot === 0 ? align : 'center');
      };
      lab(-1.75, -2, a, false, 'left');
      if (b) lab(-1.75, 2, b, false, 'left');
      lab(-1.3, 0, 'CLK', false, 'left', 0.5);
      lab(1.75, -2, 'Q', false, 'right');
      lab(1.75, 2, 'Q', true, 'right');
      lab(0, -2.45, 'PRE', lowAct, 'center', 0.5);
      lab(0, 2.45, 'CLR', lowAct, 'center', 0.5);
      const title = at(0.25, -0.75);
      text(d, type, title.x, title.y, 0.85, '#9aa5e6');
      const qv = at(0.25, 0.55);
      text(d, st ? `Q=${st.q ? 1 : 0}` : 'Q=?', qv.x, qv.y, 0.75, st?.q ? COLORS.strong : COLORS.muted);
      const name = at(0, -4.75);
      text(d, c.label ?? 'FF', name.x + (c.rot === 0 ? 1.4 : 0), name.y + (c.rot === 0 ? 0.6 : 0), 0.75, COLORS.text);
      break;
    }
    case 'readout': {
      const n = clampBits(c.bits);
      let v = 0;
      let unknown = false;
      for (let i = 0; i < n; i++) {
        const s = ps(`D${i}`);
        if (!s || s.level === 'Z' || s.level === 'X') unknown = true;
        else if (s.level === 'H') v |= 1 << i;
      }
      const hex = unknown ? '0x??' : `0x${v.toString(16).toUpperCase().padStart(2, '0')}`;
      const p = at(3.5, (n - 1) / 2);
      d.ctx.save();
      glow(d, COLORS.strong, 0.3);
      text(d, `${c.label ?? 'OUT'} = ${unknown ? '?' : v} (${hex})`, p.x, p.y, 0.95, COLORS.strong);
      d.ctx.restore();
      break;
    }
    default:
      break;
  }

  // Pins
  for (const pin of pinsOf(c)) {
    const s = ps(pin.id);
    const hov = o.hoverPin === pin.id;
    d.ctx.fillStyle = hov ? '#ffffff' : netColor(s);
    const r = hov ? 0.22 : 0.14;
    d.ctx.fillRect(pin.x - r, pin.y - r, r * 2, r * 2);
  }

  if (o.selected) {
    const b = worldBounds(c);
    d.ctx.strokeStyle = COLORS.select;
    d.ctx.lineWidth = 0.06;
    d.ctx.setLineDash([0.25, 0.18]);
    d.ctx.strokeRect(b.x0 - 0.25, b.y0 - 0.25, b.x1 - b.x0 + 0.5, b.y1 - b.y0 + 0.5);
    d.ctx.setLineDash([]);
  }
  ctx.restore();
}
