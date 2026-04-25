/* ══════════════════════════════════════════════════════
   CRAFTCODE — KAPLAY pacing rhythm controller
   ══════════════════════════════════════════════════════
   Without rhythm, the playground feels like white noise —
   a dozen independent timers all firing on their own
   bell curves. Sometimes 10 s of silence; sometimes 5
   things at once. The pacing manager arbitrates burst-
   class events so the world breathes in calm/burst
   cycles.

   The model:
     · phase: 'calm' | 'burst'
     · calm  duration: 90-180 s — only ambient tasks fire,
       big events (toss, races, mini-arcs, event spawns
       requesting permission) stay quiet.
     · burst duration: 30-60 s — the gate opens, callers
       can spawn events / arcs.

   Calm/idle tier (idle dialogue, monologues, ambient
   tasks) is NOT gated — those continue regardless,
   because the bots still need to *seem alive* during
   calm. Only "loud" things (toss, mini-arc kickoff,
   event spawns that wish to coordinate) consult
   `pacing.canBurst()`.

   Public surface:
     · pacing.phase
     · pacing.canBurst() — true only during burst phase
       AND outside the global cooldown after the last
       burst event.
     · pacing.consumeBurst() — call when you actually
       fired the burst, so a 6-12 s in-phase cooldown
       prevents two arcs from stacking instantly.

   No external deps; uses k.loop for the phase clock.
                                                              */

import type { KaplayHandle } from './kaplay.engine';

export interface PacingState {
  phase: 'calm' | 'burst';
  phaseStartedAt: number;
  phaseDurationMs: number;
  lastBurstAt: number;
  canBurst(): boolean;
  consumeBurst(): void;
  forceBurst(durationS?: number): void;
}

export interface PacingHandle {
  state: PacingState;
  destroy(): void;
}

const CALM_MIN_S = 90;
const CALM_MAX_S = 180;
const BURST_MIN_S = 30;
const BURST_MAX_S = 60;
const BURST_INNER_COOLDOWN_MS = 8_000;

export function installPacing(handle: KaplayHandle): PacingHandle {
  const k = handle.k;

  const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

  const state: PacingState = {
    phase: 'calm',
    phaseStartedAt: performance.now(),
    phaseDurationMs: rand(CALM_MIN_S, CALM_MAX_S) * 1000,
    lastBurstAt: 0,
    canBurst() {
      if (this.phase !== 'burst') return false;
      const since = performance.now() - this.lastBurstAt;
      return since >= BURST_INNER_COOLDOWN_MS;
    },
    consumeBurst() {
      this.lastBurstAt = performance.now();
    },
    forceBurst(durationS = 40) {
      this.phase = 'burst';
      this.phaseStartedAt = performance.now();
      this.phaseDurationMs = Math.max(10, durationS) * 1000;
      this.lastBurstAt = 0;
    },
  };

  // Phase clock — checked every 0.5s.
  const tick = k.loop(0.5, () => {
    const elapsed = performance.now() - state.phaseStartedAt;
    if (elapsed < state.phaseDurationMs) return;
    if (state.phase === 'calm') {
      state.phase = 'burst';
      state.phaseDurationMs = rand(BURST_MIN_S, BURST_MAX_S) * 1000;
    } else {
      state.phase = 'calm';
      state.phaseDurationMs = rand(CALM_MIN_S, CALM_MAX_S) * 1000;
    }
    state.phaseStartedAt = performance.now();
    state.lastBurstAt = 0;
  });

  if (typeof window !== 'undefined') {
    (window as unknown as { __kcPacing?: PacingState }).__kcPacing = state;
  }

  return {
    state,
    destroy() {
      try { (tick as { cancel?: () => void })?.cancel?.(); } catch (_) {}
      try { delete (window as unknown as { __kcPacing?: PacingState }).__kcPacing; } catch (_) {}
    },
  };
}
