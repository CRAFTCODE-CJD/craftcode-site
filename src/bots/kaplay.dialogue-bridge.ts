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
  pick(tag: string): Scene | null;
  play(scene: Scene): BotLine[];
  fire(tag: string, whoRemap?: BotWho): boolean;
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

  const flags = {
    rapport: 50,
    chertyozh_7_step: 0,
  };
  const sim = {
    workshopTime: 0,
    mood: { craft: 50, code: 50 },
    curiosity: 0,
    idleTimer: 0,
    timePhase: 'day' as const,
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

  const playSequence = (lines: BotLine[]) => {
    // Simple sequential play — each line holds for its hold or 2000ms.
    let delay = 0;
    for (const line of lines) {
      const hold = line.hold ?? 2000;
      setTimeout(() => renderLine(line as BotLine & { _key?: string }, hold), delay);
      delay += hold + 200;
    }
  };

  const fire = (tag: string, whoRemap?: BotWho): boolean => {
    const scene = pick(tag);
    if (!scene) return false;
    const lines = play(scene);
    const resolved = whoRemap
      ? lines.map((l) => ({ ...l, who: l.who === 'craft' ? whoRemap : (whoRemap === 'craft' ? 'code' : 'craft') as BotWho }))
      : lines;
    playSequence(resolved);
    return true;
  };

  const shim: DialogueShim = {
    flags,
    sim,
    history,
    pick,
    play,
    fire,
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
