// Helpers for pinning signals to the timing diagram.
import type { Circuit, Probe, ProbeTarget } from '../types/circuit';
import { newId, pinsOf } from './componentDefs';

export function sameTarget(a: ProbeTarget, b: ProbeTarget) {
  if (a.type === 'wire' && b.type === 'wire') return a.wireId === b.wireId;
  if (a.type === 'pin' && b.type === 'pin') return a.componentId === b.componentId && a.pinId === b.pinId;
  return false;
}

export function defaultProbeLabel(circuit: Circuit, target: ProbeTarget): string {
  if (target.type === 'wire') {
    const n = (circuit.probes ?? []).filter((p) => p.target.type === 'wire').length + 1;
    return `NET${n}`;
  }
  const comp = circuit.components.find((c) => c.id === target.componentId);
  if (!comp) return 'SIG';
  const pin = pinsOf(comp).find((p) => p.id === target.pinId);
  const pinName = target.pinId === 'QN' ? 'Q̄' : pin?.label ?? target.pinId;
  // Switches, LEDs and clocks are named by their label; FF0.Q → Q0.
  if (comp.kind === 'switch' || comp.kind === 'led' || comp.kind === 'clock') return comp.label ?? pinName;
  if (comp.kind === 'ff') {
    const m = /^FF(\d+)$/i.exec(comp.label ?? '');
    if (m && (target.pinId === 'Q' || target.pinId === 'QN')) return `${pinName}${m[1]}`;
    return `${comp.label ?? 'FF'}.${pinName}`;
  }
  if (comp.kind === 'gate') return `${comp.label ?? comp.gateType ?? 'GATE'}_OUT`.replace(/_OUT_OUT$/, '_OUT');
  return `${comp.label ?? comp.kind}.${pinName}`;
}

export function hasProbe(circuit: Circuit, target: ProbeTarget) {
  return (circuit.probes ?? []).some((p) => sameTarget(p.target, target));
}

/** Add the probe, or remove it if that signal is already pinned. */
export function toggleProbe(circuit: Circuit, target: ProbeTarget, label?: string): Circuit {
  const probes = circuit.probes ?? [];
  if (hasProbe(circuit, target)) return { ...circuit, probes: probes.filter((p) => !sameTarget(p.target, target)) };
  const probe: Probe = { id: newId('p'), label: label ?? defaultProbeLabel(circuit, target), target };
  return { ...circuit, probes: [...probes, probe] };
}
