/* ══════════════════════════════════════════════════════
   CRAFTCODE — KAPLAY ↔ dialogue bridge
   ══════════════════════════════════════════════════════
   Wires the existing SCENES database (dialogues.data.js) +
   i18n layer into the KAPLAY playground's bubble renderer.
   Keeps bot.ai.ts / bot.terminal.ts untouched — they still
   call `window.__dialogue.fire(tag, who)` and
   `window.__companions.playSequence(lines)`.

   This module installs a shim under those names that
   forwards to the KAPLAY bubble API, so scenes authored
   against the legacy engine's contract keep working.    */

import type { KaplayHandle, BotWho, KaplayBotsMap } from './kaplay.engine';
// @ts-ignore untyped legacy JS module
import { SCENES } from './dialogues.data.js';
import type { BotLine, Scene } from './bot.types';

interface DialogueShim {
  flags: Record<string, unknown>;
  sim: Record<string, unknown>;
  history: Array<{ id: string; t: number }>;
  /** 'idle' if no bubble queue active; 'busy' while a sequence plays. */
  state: 'idle' | 'busy';
  pick(tag: string): Scene | null;
  play(scene: Scene): BotLine[];
  fire(tag: string, whoRemap?: BotWho): boolean;
  /** Plays an arbitrary list of pre-staged lines (used by toss intro etc.). */
  playSequence(lines: BotLine[]): Promise<void>;
  /** Fast lane: short floating-bubble (no scene pipeline). */
  quickBubble(who: BotWho, text: string, holdMs?: number): void;
  /** Set the active behavior-action hook — invoked when a behavior scene starts. */
  setBehaviorActionHook(fn: ((id: string) => void) | null): void;
  /** Set the floor-button effect callback — invoked when 'button_pressed' scene picks. */
  setFloorButtonHook(fn: (() => void) | null): void;
  /** Bump rapport by `delta`, clamped 0..100. Mirrors HUD if present. */
  adjustRapport(delta: number): void;
  /** Add a bot-on-bot bump and mirror HUD. */
  recordBump(): void;
}

// Single global tracker of the currently-visible bubble, so the
// `langchange` listener can rewrite its text when the user toggles
// language mid-display. Legacy engine stored this on `companions._activeBubble`.
interface ActiveBubble {
  who: BotWho;
  key: string | null;
  fallback: string;
  // endsAt (perf.now ms) — after this the bubble is gone; don't rewrite.
  endsAt: number;
}

function resolveI18n(key: string | null | undefined, fallback: string): string {
  if (!key) return fallback;
  const w = window as unknown as { __i18n?: { t?: (k: string) => string } };
  const t = w.__i18n?.t;
  if (typeof t !== 'function') return fallback;
  try {
    const v = t(key);
    if (typeof v === 'string' && v.length && v !== key) return v;
  } catch (_) { /* noop */ }
  return fallback;
}

// Map of `line.act` values (legacy BotLine.act) → KAPLAY animation name.
// Kept narrow: only acts that have a visible clip in kaplay.engine's ANIMS.
const ACT_TO_CLIP: Record<string, string> = {
  wave: 'wave',
  excited: 'excited',
  surprised: 'excited',   // no dedicated surprised anim in ANIMS — re-use
  typing: 'typing',
};

export function installDialogueBridge(handle: KaplayHandle): () => void {
  const cooldowns: Record<string, number> = {};
  const history: Array<{ id: string; t: number }> = [];

  const flags: Record<string, unknown> & { rapport: number; chertyozh_7_step: number } = {
    rapport: 50,
    chertyozh_7_step: 0,
  };
  // `sim` is a mutable bag — schedulers (kaplay.sim.ts) drift mood,
  // accumulate bumps, etc. Defaults match the legacy engine.
  const sim: Record<string, unknown> & {
    workshopTime: number;
    mood: { craft: number; code: number };
    curiosity: number;
    idleTimer: number;
    timePhase: 'morning' | 'day' | 'evening';
    bumps: number;
    rapport: number;
  } = {
    workshopTime: 0,
    mood: { craft: 50, code: 50 },
    curiosity: 0,
    idleTimer: 0,
    timePhase: 'day',
    bumps: 0,
    rapport: 50,
  };

  const ctx = { flags, sim, history };

  const pick = (tag: string): Scene | null => {
    const now = performance.now();
    const candidates = (SCENES as Scene[]).filter((s) =>
      s.tags.includes(tag) &&
      (!cooldowns[s.id] || cooldowns[s.id] <= now) &&
      (!s.requires || (() => { try { return s.requires!(ctx as never); } catch { return true; } })())
    );
    if (!candidates.length) return null;
    const total = candidates.reduce((a, b) => a + (b.weight || 1), 0);
    let r = Math.random() * total;
    for (const c of candidates) {
      r -= c.weight || 1;
      if (r <= 0) return c;
    }
    return candidates[candidates.length - 1];
  };

  // Stamp `_key` just like the legacy engine does — `dialogue.<scene.id>.l<N>`,
  // 1-based. Consumers (playSequence) read the key at render time.
  const play = (scene: Scene): BotLine[] => {
    cooldowns[scene.id] = performance.now() + ((scene.cooldown || 30) * 1000);
    history.push({ id: scene.id, t: performance.now() });
    if (history.length > 32) history.shift();
    if (scene.effect) try { scene.effect(ctx as never); } catch (_) {}
    return scene.lines.map((l, i) => ({
      ...l,
      _key: `dialogue.${scene.id}.l${i + 1}`,
    } as BotLine & { _key: string }));
  };

  // Track currently-displayed bubble (the most recent showBubble call) so
  // we can re-render on `langchange`.
  let activeBubble: ActiveBubble | null = null;

  const getBots = (): KaplayBotsMap | undefined => {
    return (window as unknown as { __kaplayBots?: { bots?: KaplayBotsMap } }).__kaplayBots?.bots;
  };

  // Given a line, do the clip/act work: play the animation on the relevant
  // bot (if any), then schedule a return-to-idle after the hold window.
  const applyLineAction = (line: BotLine & { _key?: string }, holdMs: number) => {
    const bots = getBots();
    if (!bots) return;
    const who = line.who as BotWho;
    const bot = bots[who];
    if (!bot) return;

    // `line.clip` takes precedence, then `line.act`.
    const clipName = line.clip || (line.act ? ACT_TO_CLIP[line.act] : undefined);

    // Special-case act=jump — trigger a physics jump instead of a clip.
    if (line.act === 'jump' as unknown) {
      try { if ((bot as { isGrounded?: () => boolean }).isGrounded?.()) (bot as { jump?: (n?: number) => void }).jump?.(520); } catch (_) {}
      return;
    }

    if (!clipName) return;
    try {
      (bot as { play?: (c: string) => void }).play?.(clipName);
    } catch (_) { return; }

    // Return to idle after the hold window (matches legacy setCharState
    // restore-to-idle after typewriter), but only if grounded.
    setTimeout(() => {
      try {
        const grounded = (bot as { isGrounded?: () => boolean }).isGrounded?.();
        if (grounded !== false) {
          (bot as { play?: (c: string) => void }).play?.('idle');
        }
      } catch (_) { /* bot might be destroyed */ }
    }, Math.max(holdMs, 600));
  };

  const renderLine = (line: BotLine & { _key?: string }, holdMs: number) => {
    const who = line.who as BotWho;
    const fallback = line.text;
    const key = line._key || null;
    const text = resolveI18n(key, fallback);
    activeBubble = {
      who,
      key,
      fallback,
      endsAt: performance.now() + holdMs,
    };
    handle.showBubble(who, text, holdMs);
    applyLineAction(line, holdMs);
  };

  // Dialogue lifecycle. `busy` while a sequence is actively rendering;
  // schedulers consult `state === 'idle'` before queueing new dialogue.
  let dialogueState: 'idle' | 'busy' = 'idle';
  // Token bumped on each new sequence so older timers can detect they
  // belong to a stale run and bail out.
  let sequenceToken = 0;

  let behaviorActionHook: ((id: string) => void) | null = null;
  let floorButtonHook: (() => void) | null = null;

  // Returns a Promise that resolves when the last line's hold ends, so
  // schedulers can chain (e.g. toss intro → physical toss).
  const playSequence = (lines: BotLine[]): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (!lines || !lines.length) { resolve(); return; }
      dialogueState = 'busy';
      // Reflect on the legacy `__companions` shim too (terminal/etc. read it).
      try {
        const w = window as unknown as { __companions?: { dialogueState: string } };
        if (w.__companions) w.__companions.dialogueState = 'talking';
      } catch (_) {}
      const myToken = ++sequenceToken;
      let delay = 0;
      let lastHoldEnd = 0;
      for (const line of lines) {
        const hold = line.hold ?? 2000;
        const fireAt = delay;
        setTimeout(() => {
          if (myToken !== sequenceToken) return;
          renderLine(line as BotLine & { _key?: string }, hold);
        }, fireAt);
        delay += hold + 200;
        lastHoldEnd = fireAt + hold;
      }
      setTimeout(() => {
        if (myToken !== sequenceToken) return;
        dialogueState = 'idle';
        try {
          const w = window as unknown as { __companions?: { dialogueState: string } };
          if (w.__companions) w.__companions.dialogueState = 'idle';
        } catch (_) {}
        resolve();
      }, Math.max(lastHoldEnd, 0) + 300);
    });
  };

  // Quick bubble — no scene, no busy state, no key. Used for inner
  // monologue + button-press one-liners.
  const quickBubble = (who: BotWho, text: string, holdMs = 1500) => {
    handle.showBubble(who, text, holdMs);
    activeBubble = {
      who,
      key: null,
      fallback: text,
      endsAt: performance.now() + holdMs,
    };
  };

  const adjustRapport = (delta: number) => {
    const next = Math.max(0, Math.min(100, (flags.rapport ?? 50) + delta));
    flags.rapport = next;
    sim.rapport = next;
    try {
      const hud = document.getElementById('hud-rapport');
      if (hud) hud.textContent = String(Math.round(next));
    } catch (_) {}
  };

  const recordBump = () => {
    sim.bumps = (sim.bumps ?? 0) + 1;
    try {
      const hud = document.getElementById('hud-bumps');
      if (hud) hud.textContent = String(sim.bumps);
    } catch (_) {}
  };

  const fire = (tag: string, whoRemap?: BotWho): boolean => {
    // Don't preempt active dialogue — legacy guarded the same way.
    if (dialogueState === 'busy') return false;
    const scene = pick(tag);
    if (!scene) return false;
    const lines = play(scene);
    const resolved = whoRemap
      ? lines.map((l) => ({ ...l, who: l.who === 'craft' ? whoRemap : (whoRemap === 'craft' ? 'code' : 'craft') as BotWho }))
      : lines;
    // Behavior-tier scenes carry id `behavior.*` — fire the action hook
    // alongside the dialogue (parity with legacy playSequence).
    if (scene.id.startsWith('behavior.') && behaviorActionHook) {
      try { behaviorActionHook(scene.id); } catch (_) {}
    }
    // Floor-button scenes (id `button_pressed.*`) trigger their own hook,
    // letting kaplay.ai-loop spawn FX when a bot stamps the pad.
    if (scene.id.startsWith('button_pressed') && floorButtonHook) {
      try { floorButtonHook(); } catch (_) {}
    }
    playSequence(resolved);
    return true;
  };

  const setBehaviorActionHook = (fn: ((id: string) => void) | null) => { behaviorActionHook = fn; };
  const setFloorButtonHook    = (fn: (() => void) | null)              => { floorButtonHook    = fn; };

  const shim: DialogueShim = {
    flags,
    sim,
    history,
    get state() { return dialogueState; },
    pick,
    play,
    fire,
    playSequence,
    quickBubble,
    setBehaviorActionHook,
    setFloorButtonHook,
    adjustRapport,
    recordBump,
  };

  // Expose under the legacy global names so bot.ai.ts / bot.terminal.ts
  // and anything else calling `window.__dialogue.fire()` keep working.
  const w = window as unknown as {
    __dialogue?: DialogueShim;
    __companions?: {
      dialogueState: 'idle' | 'talking';
      playSequence: (lines: BotLine[]) => void;
      fire?: (tag: string, whoRemap?: BotWho) => boolean;
      _started?: boolean;
    };
  };
  const prevDialogue = w.__dialogue;
  const prevCompanions = w.__companions;

  w.__dialogue = shim;
  w.__companions = {
    dialogueState: 'idle',
    playSequence,
    fire,
    _started: true,
  };

  // Re-render the currently-visible bubble when the user toggles language.
  // Parallels engine.legacy.js line ~2854. We only rewrite the DOM text of
  // the active bubble; the hold timer stays as-is.
  const onLangChange = () => {
    if (!activeBubble) return;
    if (performance.now() > activeBubble.endsAt) return;
    const next = resolveI18n(activeBubble.key, activeBubble.fallback);
    // Re-use showBubble with a very short delta — it will restamp text
    // and restart the hide timer. We compute remaining ms to preserve
    // close-to-original hold.
    const remaining = Math.max(400, activeBubble.endsAt - performance.now());
    handle.showBubble(activeBubble.who, next, remaining);
    activeBubble.endsAt = performance.now() + remaining;
  };
  try { window.addEventListener('langchange', onLangChange); } catch (_) {}

  return () => {
    try { window.removeEventListener('langchange', onLangChange); } catch (_) {}
    w.__dialogue = prevDialogue;
    w.__companions = prevCompanions;
  };
}
