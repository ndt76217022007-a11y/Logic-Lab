import { useEffect, useRef, useState } from 'react';
import {
  SUCCESS_BANNER,
  createDominoWorld,
  failureBanner,
  formatInputs,
  stepDominoWorld,
  type DominoWorld,
  type VerifyResult,
} from '../engine/dominoVerifier';

interface Props {
  result: VerifyResult;
  runId: number;
  lessonTitle: string;
  onRerun: () => void;
  onClose: () => void;
}

const HEIGHT = 290;
const FONT = 'VT323, "JetBrains Mono", monospace';

export default function DominoTestPanel({ result, runId, lessonTitle, onRerun, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<DominoWorld | null>(null);
  const [phase, setPhase] = useState<'running' | 'done'>('running');

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    let w = canvas.parentElement!.clientWidth;
    const groundY = HEIGHT - 104;
    const setup = () => {
      w = canvas.parentElement!.clientWidth;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(HEIGHT * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${HEIGHT}px`;
    };
    setup();
    worldRef.current = createDominoWorld(result.slots, w, groundY);
    setPhase('running');
    let raf = 0;
    let last = performance.now();
    let delay = 0.35; // pause before the push
    let flash = 0;

    const draw = (t: number) => {
      const world = worldRef.current!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // background
      const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      g.addColorStop(0, '#0b0e1c');
      g.addColorStop(1, '#151030');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, HEIGHT);
      // pixel stars
      ctx.fillStyle = '#2a2f55';
      for (let i = 0; i < 40; i++) ctx.fillRect((i * 97.3) % w, (i * 37.7) % (groundY - 40), 2, 2);

      // header
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.font = `14px ${FONT}`;
      ctx.fillStyle = '#7d86b3';
      ctx.fillText(`REAL TIME · ${lessonTitle.toUpperCase()} · ${result.slots.length} VECTORS`, 14, 16);
      const passed = result.slots.filter((s) => s.pass).length;
      ctx.textAlign = 'right';
      ctx.fillStyle = passed === result.slots.length ? '#5dff9b' : '#ff8a96';
      ctx.fillText(`PASSED ${passed}/${result.slots.length}`, w - 14, 16);

      // banner
      ctx.textAlign = 'center';
      let banner = 'SAME PUSH…';
      let bannerColor = '#c9d1ff';
      if (world.finished) {
        if (result.allPass) {
          banner = SUCCESS_BANNER;
          bannerColor = '#ffc94a';
        } else {
          banner = result.firstFailure ? failureBanner(result.firstFailure) : 'NO TEST VECTORS';
          bannerColor = '#ff4d5e';
        }
      }
      ctx.font = `${world.finished ? 34 : 28}px ${FONT}`;
      ctx.fillStyle = bannerColor;
      ctx.shadowColor = bannerColor;
      ctx.shadowBlur = world.finished ? 14 + Math.sin(t * 4) * 4 : 0;
      const maxW = w - 40;
      const tw = ctx.measureText(banner).width;
      if (tw > maxW) ctx.font = `${Math.floor(34 * (maxW / tw))}px ${FONT}`;
      ctx.fillText(banner, w / 2, 48);
      ctx.shadowBlur = 0;
      if (world.finished && !result.allPass && result.firstFailure) {
        const f = result.firstFailure;
        const exp = Object.entries(f.expected).map(([k, v]) => `${k}=${v}`).join(' ');
        const got = Object.entries(f.actual).map(([k, v]) => `${k}=${v}`).join(' ');
        const extra = result.setupErrors.length ? result.setupErrors.join(' · ') : f.note ?? '';
        ctx.font = `16px ${FONT}`;
        ctx.fillStyle = '#ff8a96';
        ctx.fillText(`expected ${exp} · got ${got}${extra ? ' · ' + extra : ''}`, w / 2, 76);
      }

      // ground
      ctx.fillStyle = '#2a2f55';
      ctx.fillRect(0, groundY, w, 4);
      ctx.fillStyle = '#1b1f38';
      ctx.fillRect(0, groundY + 4, w, 2);

      // legend for input bits
      const keys = Object.keys(result.slots[0]?.inputs ?? {});
      ctx.font = `13px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#59607a';
      ctx.fillText(`IN ${keys.join('')}`, 10, groundY + 18);

      // dominoes / gaps
      for (const b of world.bodies) {
        const x = b.pivotX;
        const labelBits = keys.map((k) => b.slot.inputs[k]).join('');
        if (!b.present) {
          ctx.strokeStyle = '#ff4d5e';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(x - world.width, groundY - world.height, world.width, world.height);
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(255,77,94,0.10)';
          ctx.fillRect(x - world.width, groundY - world.height, world.width, world.height);
          ctx.textAlign = 'center';
          ctx.fillStyle = '#ff4d5e';
          ctx.font = `14px ${FONT}`;
          ctx.fillText(labelBits, x - world.width / 2, groundY + 18);
          // Detailed expected/actual only under the first gap (where the chain stops).
          if (b.slot === result.firstFailure) {
            ctx.font = `12px ${FONT}`;
            ctx.fillText(`exp ${Object.values(b.slot.expected).join('')}`, x - world.width / 2, groundY + 32);
            ctx.fillText(`got ${Object.values(b.slot.actual).join('')}`, x - world.width / 2, groundY + 44);
          }
          continue;
        }
        ctx.save();
        ctx.translate(x, groundY);
        ctx.rotate(b.theta);
        const hit = b.hitAt !== null;
        const flashAmt = hit ? Math.max(0, 1 - (world.time - (b.hitAt ?? 0)) * 3) : 0;
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 6 + flashAmt * 18;
        ctx.fillRect(-world.width, -world.height, world.width, world.height);
        ctx.shadowBlur = 0;
        // pixel bevel
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(-world.width, -world.height, 2, world.height);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(-2, -world.height, 2, world.height);
        ctx.fillRect(-world.width, -world.height / 2 - 1, world.width, 2);
        // pips
        ctx.fillStyle = '#ffffff';
        const pip = Math.max(3, world.width * 0.34);
        ctx.fillRect(-world.width / 2 - pip / 2, -world.height * 0.75 - pip / 2, pip, pip);
        ctx.fillRect(-world.width / 2 - pip / 2, -world.height * 0.25 - pip / 2, pip, pip);
        ctx.restore();
        ctx.textAlign = 'center';
        ctx.font = `14px ${FONT}`;
        ctx.fillStyle = hit ? '#c9d1ff' : '#59607a';
        ctx.fillText(labelBits, x - world.width / 2, groundY + 18);
        if (hit) {
          ctx.fillStyle = '#5dff9b';
          ctx.font = `12px ${FONT}`;
          ctx.fillText('✓', x - world.width / 2, groundY + 32);
        }
      }

      // pusher
      if (!world.pusherDone || world.time < 1.5) {
        const px = world.pusherX;
        ctx.fillStyle = '#c9d1ff';
        ctx.fillRect(px - 18, groundY - 14, 18, 10);
        ctx.fillStyle = '#7d86b3';
        ctx.fillRect(px - 30, groundY - 12, 12, 6);
      }

      if (flash > 0) {
        ctx.fillStyle = `rgba(255,77,94,${flash * 0.25})`;
        ctx.fillRect(0, 0, w, HEIGHT);
      }
    };

    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const world = worldRef.current!;
      if (delay > 0) delay -= dt;
      else if (!world.finished) {
        const ev = stepDominoWorld(world, dt);
        for (const e of ev) {
          if (e.type === 'done') {
            setPhase('done');
            if (!result.allPass) flash = 1;
          }
        }
      }
      flash = Math.max(0, flash - dt * 2);
      draw(t / 1000);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const ro = new ResizeObserver(() => {
      const oldW = w;
      setup();
      if (Math.abs(oldW - w) > 4 && worldRef.current && !worldRef.current.pusherDone) {
        worldRef.current = createDominoWorld(result.slots, w, groundY);
      }
    });
    ro.observe(canvas.parentElement!);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [runId, result, lessonTitle]);

  return (
    <section className="relative shrink-0 border-t-2 border-edge bg-[#0b0e1c]">
      <div className="relative w-full">
        <canvas ref={canvasRef} className="block" />
      </div>
      <div className="absolute bottom-2 right-3 flex gap-2">
        <button className="btn-primary text-base" onClick={onRerun}>
          ↻ Same Push (Re-run)
        </button>
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="absolute bottom-2 left-3 font-mono text-[10px] text-slate-500">
        {phase === 'running' ? 'chain reaction in progress…' : result.allPass ? 'every vector passed' : `stopped at ${result.firstFailure ? formatInputs(result.firstFailure.inputs) : '—'}`}
      </div>
    </section>
  );
}
