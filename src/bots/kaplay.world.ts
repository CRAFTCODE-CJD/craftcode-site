/* ══════════════════════════════════════════════════════
   CRAFTCODE — KAPLAY world-state accumulation
   ══════════════════════════════════════════════════════
   Persistent counters that turn the playground from
   "random simulation" into a world that *remembers*
   things. State lives for the lifetime of the page
   (per-session). Used by the task system and arcs to
   drive narrative variety; mirrored into the HUD so the
   viewer sees "commits 3", "day 1", a heart pulse, etc.

   Surface:
     · world.commits           — completed code_at_step runs
     · world.coffees           — completed coffee_break runs
     · world.fixes             — completed hammer_at_crate runs
     · world.naps              — completed nap_on_step runs
     · world.day               — wall-clock days since first morning
     · world.lastPhase         — to detect morning rollovers
     · world.startedAt         — perf.now() when installed
     · world.bumpDecor()       — adds a ☕ chip in the corner (FIFO 10)
     · world.flashCommit()     — HUD pulse + counter++
     · world.refreshAffection()— recomputes heart icon based on rapport

   No setTimeout — uses k.loop / k.onUpdate so cleanup
   is automatic with engine destroy().
                                                              */

import type { KaplayHandle } from './kaplay.engine';

interface DialogueLikeWorld {
  sim: {
    rapport: number;
    timePhase: 'morning' | 'day' | 'evening';
    mood: { craft: number; code: number };
  };
}

const getDialogue = (): DialogueLikeWorld | null => {
  const w = window as unknown as { __dialogue?: DialogueLikeWorld };
  return w.__dialogue ?? null;
};

export interface WorldState {
  commits: number;
  coffees: number;
  fixes: number;
  naps: number;
  day: number;
  lastPhase: 'morning' | 'day' | 'evening';
  startedAt: number;
  bumpDecor(emoji: string): void;
  flashCommit(): void;
  flashFix(): void;
  flashCoffee(): void;
  flashNap(): void;
  refreshAffection(): void;
}

export interface WorldHandle {
  state: WorldState;
  destroy(): void;
}

const HUD_ID = 'kc-world-hud';
const DECOR_ID = 'kc-world-decor';
const DECOR_LIMIT = 10;

function makeCell(label: string, valueId: string, valueText: string): HTMLElement {
  const cell = document.createElement('span');
  cell.className = 'kw-cell';
  const k = document.createElement('span');
  k.className = 'kw-k';
  k.textContent = label;
  const v = document.createElement('span');
  v.className = 'kw-v';
  v.id = valueId;
  v.textContent = valueText;
  cell.appendChild(k);
  cell.appendChild(document.createTextNode(' '));
  cell.appendChild(v);
  return cell;
}

function ensureHudShell(stage: HTMLElement | null): HTMLElement | null {
  if (!stage) return null;
  let hud = document.getElementById(HUD_ID);
  if (hud && hud.isConnected) return hud;
  hud = document.createElement('div');
  hud.id = HUD_ID;
  hud.className = 'kc-world-hud';
  hud.setAttribute('aria-hidden', 'true');
  hud.appendChild(makeCell('day', 'kw-day', '1'));
  hud.appendChild(makeCell('commits', 'kw-commits', '0'));
  hud.appendChild(makeCell('fixes', 'kw-fixes', '0'));
  // Heart cell
  const heart = document.createElement('span');
  heart.className = 'kw-cell kw-heart';
  heart.id = 'kw-heart';
  heart.title = 'rapport';
  const heartGlyph = document.createElement('span');
  heartGlyph.className = 'kw-heart-glyph';
  heartGlyph.textContent = '·';
  heart.appendChild(heartGlyph);
  hud.appendChild(heart);
  stage.appendChild(hud);
  return hud;
}

function ensureDecor(stage: HTMLElement | null): HTMLElement | null {
  if (!stage) return null;
  let decor = document.getElementById(DECOR_ID);
  if (decor && decor.isConnected) return decor;
  decor = document.createElement('div');
  decor.id = DECOR_ID;
  decor.className = 'kc-world-decor';
  decor.setAttribute('aria-hidden', 'true');
  stage.appendChild(decor);
  return decor;
}

function ensureStyles(): void {
  if (document.getElementById('kc-world-styles')) return;
  const style = document.createElement('style');
  style.id = 'kc-world-styles';
  style.textContent = `
.kc-world-hud {
  position: absolute;
  top: 8px;
  right: 12px;
  z-index: 4;
  display: flex;
  gap: 10px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--muted);
  pointer-events: none;
}
.kc-world-hud .kw-k { color: var(--accent); margin-right: 4px; }
.kc-world-hud .kw-v { color: var(--accent-2); }
.kc-world-hud .kw-cell { white-space: nowrap; }
.kc-world-hud .kw-flash {
  text-shadow: 0 0 8px var(--accent-2);
  transition: text-shadow 0.6s ease;
}
.kc-world-hud .kw-heart {
  font-size: 12px;
  filter: drop-shadow(0 0 4px transparent);
  transition: filter 0.6s ease;
}
.kc-world-hud .kw-heart.warm .kw-heart-glyph { color: #ff6ec7; }
.kc-world-hud .kw-heart.warm { filter: drop-shadow(0 0 6px #ff6ec7); animation: kw-heart-pulse 1.4s ease-in-out infinite; }
.kc-world-hud .kw-heart.cold .kw-heart-glyph { color: #777; }
.kc-world-hud .kw-heart.cold { filter: drop-shadow(0 0 4px #555); }
.kc-world-hud .kw-heart.neutral .kw-heart-glyph { color: var(--muted); }
@keyframes kw-heart-pulse {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.18); }
}

.kc-world-decor {
  position: absolute;
  top: 28px;
  right: 12px;
  z-index: 4;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  font-size: 14px;
  pointer-events: none;
  max-height: 180px;
  overflow: hidden;
  line-height: 1;
}
.kc-world-decor .kw-chip {
  opacity: 0;
  transform: translateY(-4px);
  animation: kw-chip-in 0.6s ease forwards;
  filter: drop-shadow(0 0 3px color-mix(in oklab, var(--accent-2) 50%, transparent));
}
@keyframes kw-chip-in {
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .kc-world-hud .kw-heart.warm { animation: none; }
  .kc-world-decor .kw-chip { animation: none; opacity: 1; transform: none; }
}
`;
  document.head.appendChild(style);
}

export function installWorld(handle: KaplayHandle): WorldHandle {
  const k = handle.k;
  ensureStyles();

  const stage = document.getElementById('cc-stage');
  const hud = ensureHudShell(stage);
  const decor = ensureDecor(stage);
  void hud; void decor; // referenced via ids below

  const state: WorldState = {
    commits: 0,
    coffees: 0,
    fixes: 0,
    naps: 0,
    day: 1,
    lastPhase: getDialogue()?.sim.timePhase ?? 'day',
    startedAt: performance.now(),
    bumpDecor(emoji: string) {
      const d = document.getElementById(DECOR_ID);
      if (!d) return;
      const chip = document.createElement('span');
      chip.className = 'kw-chip';
      chip.textContent = emoji;
      d.appendChild(chip);
      while (d.children.length > DECOR_LIMIT) {
        d.removeChild(d.firstElementChild!);
      }
    },
    flashCommit() {
      this.commits++;
      const el = document.getElementById('kw-commits');
      if (!el) return;
      el.textContent = String(this.commits);
      el.classList.add('kw-flash');
      k.wait(0.6, () => { try { el.classList.remove('kw-flash'); } catch (_) {} });
    },
    flashFix() {
      this.fixes++;
      const el = document.getElementById('kw-fixes');
      if (!el) return;
      el.textContent = String(this.fixes);
      el.classList.add('kw-flash');
      k.wait(0.6, () => { try { el.classList.remove('kw-flash'); } catch (_) {} });
    },
    flashCoffee() {
      this.coffees++;
      this.bumpDecor('☕');
    },
    flashNap() {
      this.naps++;
      this.bumpDecor('💤');
    },
    refreshAffection() {
      const dlg = getDialogue();
      const heart = document.getElementById('kw-heart');
      if (!heart) return;
      const glyph = heart.querySelector('.kw-heart-glyph') as HTMLElement | null;
      if (!glyph) return;
      const r = dlg?.sim.rapport ?? 50;
      heart.classList.remove('warm', 'cold', 'neutral');
      if (r >= 70) {
        heart.classList.add('warm');
        glyph.textContent = '♥';
      } else if (r <= 30) {
        heart.classList.add('cold');
        glyph.textContent = '♡';
      } else {
        heart.classList.add('neutral');
        glyph.textContent = '·';
      }
    },
  };

  state.refreshAffection();

  // Cheap polling — once every 0.5s is plenty for HUD freshness.
  const tick = k.loop(0.5, () => {
    const dlg = getDialogue();
    if (!dlg) return;
    // Day rollover: morning transition increments the day counter.
    const phase = dlg.sim.timePhase;
    if (state.lastPhase !== 'morning' && phase === 'morning') {
      state.day++;
      const dayEl = document.getElementById('kw-day');
      if (dayEl) {
        dayEl.textContent = String(state.day);
        dayEl.classList.add('kw-flash');
        k.wait(0.6, () => { try { dayEl.classList.remove('kw-flash'); } catch (_) {} });
      }
    }
    state.lastPhase = phase;
    state.refreshAffection();
  });

  if (typeof window !== 'undefined') {
    (window as unknown as { __kcWorld?: WorldState }).__kcWorld = state;
  }

  return {
    state,
    destroy() {
      try { (tick as { cancel?: () => void })?.cancel?.(); } catch (_) {}
      try { document.getElementById(HUD_ID)?.remove(); } catch (_) {}
      try { document.getElementById(DECOR_ID)?.remove(); } catch (_) {}
      try { delete (window as unknown as { __kcWorld?: WorldState }).__kcWorld; } catch (_) {}
    },
  };
}
