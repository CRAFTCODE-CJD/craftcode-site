/* ══════════════════════════════════════════════════════
   CRAFTCODE — KAPLAY simulation tickers
   ══════════════════════════════════════════════════════
   Cheap math tickers that drift `dialogue.sim` over time
   and mirror the relevant values into the HUD. Mirrors the
   tip of legacy engine.legacy.js `_simTick`:

     · mood drift toward 50 every ~2 s
     · timePhase derived from hour-of-day (morning/day/evening)
     · slow rapport drift (±2 every ~2 min)
     · idleTimer counter

   Bot-on-bot bump tracking is wired by kaplay.engine.ts
   (it has the collision callbacks); this module only reacts
   to the bump count to fire `bumped_repeated` flavor.
                                                              */

import type { KaplayHandle } from './kaplay.engine';
import type { BotWho } from './kaplay.engine';

interface DialogueLikeMin {
  state: 'idle' | 'busy';
  fire(tag: string, who?: BotWho): boolean;
  sim: {
    mood: { craft: number; code: number };
    timePhase: 'morning' | 'day' | 'evening';
    rapport: number;
    bumps: number;
    idleTimer: number;
  };
  flags: { rapport: number };
  adjustRapport(delta: number): void;
}

const getDialogue = (): DialogueLikeMin | null => {
  const w = window as unknown as { __dialogue?: DialogueLikeMin };
  return w.__dialogue ?? null;
};

const phaseFromClock = (): 'morning' | 'day' | 'evening' => {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 19 || h < 5) return 'evening';
  return 'day';
};

export interface SimTickHandle {
  destroy(): void;
}

export function startSimTickers(handle: KaplayHandle): SimTickHandle {
  const k = handle.k;

  // 1. Mood drift toward 50 — one point every 2 s, applied each frame.
  const moodDrift = k.onUpdate(() => {
    const dlg = getDialogue();
    if (!dlg) return;
    const dt = k.dt();
    const m = dlg.sim.mood;
    (['craft', 'code'] as BotWho[]).forEach((who) => {
      const cur = m[who] ?? 50;
      const diff = 50 - cur;
      if (Math.abs(diff) > 0.1) m[who] = cur + Math.sign(diff) * (dt * 0.5);
    });
    dlg.sim.idleTimer = (dlg.sim.idleTimer ?? 0) + dt;
  });

  // 2. timePhase tracker — clock-of-day, refreshed once a minute.
  const phaseTimer = setInterval(() => {
    const dlg = getDialogue();
    if (!dlg) return;
    const next = phaseFromClock();
    if (dlg.sim.timePhase !== next) {
      dlg.sim.timePhase = next;
      // Fire the legacy phase-transition scenes (some scenes gate on
      // tag 'morning' / 'evening'). Skip if dialogue is busy.
      if (dlg.state === 'idle') {
        if (next === 'morning') dlg.fire('morning');
        else if (next === 'evening') dlg.fire('evening');
      }
    }
  }, 60_000);

  // Run once on boot too so HUD/timePhase reflect reality from t=0.
  setTimeout(() => {
    const dlg = getDialogue();
    if (dlg) dlg.sim.timePhase = phaseFromClock();
  }, 200);

  // 3. Slow rapport drift — every 2 minutes nudge ±2. Light-touch
  //    "world breathes" feel; no behavioural impact unless the user
  //    explicitly drags / collides.
  const rapportDrift = setInterval(() => {
    const dlg = getDialogue();
    if (!dlg) return;
    const delta = (Math.random() < 0.5 ? -2 : +2);
    dlg.adjustRapport(delta);
  }, 120_000);

  // 4. HUD initial paint — by the time installDialogueBridge runs, the
  //    HUD spans already exist in DOM but show "50 / 0". Sync once so
  //    they match `dialogue.sim` even if a later module changes defaults.
  setTimeout(() => {
    try {
      const r = document.getElementById('hud-rapport');
      const b = document.getElementById('hud-bumps');
      const dlg = getDialogue();
      if (r && dlg) r.textContent = String(Math.round(dlg.sim.rapport ?? 50));
      if (b && dlg) b.textContent = String(dlg.sim.bumps ?? 0);
    } catch (_) {}
  }, 200);

  return {
    destroy() {
      try { moodDrift?.cancel?.(); } catch (_) {}
      clearInterval(phaseTimer);
      clearInterval(rapportDrift);
    },
  };
}
