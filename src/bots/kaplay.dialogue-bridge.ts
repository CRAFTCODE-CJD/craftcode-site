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

import type { KaplayHandle, BotWho } from './kaplay.engine';
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

  const play = (scene: Scene): BotLine[] => {
    cooldowns[scene.id] = performance.now() + ((scene.cooldown || 30) * 1000);
    history.push({ id: scene.id, t: performance.now() });
    if (history.length > 32) history.shift();
    if (scene.effect) try { scene.effect(ctx as never); } catch (_) {}
    return scene.lines.map((l) => ({ ...l }));
  };

  const playSequence = (lines: BotLine[]) => {
    // Simple sequential play — each line holds for its hold or 2000ms.
    let delay = 0;
    for (const line of lines) {
      const hold = line.hold ?? 2000;
      const who = line.who as BotWho;
      const text = line.text;
      setTimeout(() => handle.showBubble(who, text, hold), delay);
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

  return () => {
    w.__dialogue = prevDialogue;
    w.__companions = prevCompanions;
  };
}
