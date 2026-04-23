/* ══════════════════════════════════════════════════════
   CRAFTCODE — Typed dialogue facade
   ══════════════════════════════════════════════════════
   Thin re-export layer over dialogues.data.js (the 884-scene
   database ported verbatim from the legacy engine). Keeps the
   data untouched while giving call sites a typed surface.    */

import type { Scene, BotLine, BotId } from './bot.types';
// Legacy data module is untyped JS — import as unknown and cast once.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - untyped legacy module
import { SCENES as RAW_SCENES } from './dialogues.data.js';

export const SCENES: readonly Scene[] = RAW_SCENES as Scene[];

/** Narrow BotLine helper: produce a line with safe defaults. */
export function line(who: BotId, text: string, extra: Partial<BotLine> = {}): BotLine {
  return { who, text, ...extra };
}

/** Find all scenes that carry a given tag. Used by bot.ai.ts / engine handle. */
export function scenesByTag(tag: string): Scene[] {
  return SCENES.filter((s) => s.tags.includes(tag));
}

/** Quick lookup by scene id. */
export function sceneById(id: string): Scene | undefined {
  return SCENES.find((s) => s.id === id);
}
