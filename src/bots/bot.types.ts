/* ══════════════════════════════════════════════════════
   CRAFTCODE — Bot type surface
   ══════════════════════════════════════════════════════
   Shared types consumed by bot.engine.ts, bot.dialogues.ts,
   bot.ai.ts, bot.terminal.ts. The legacy JS engine (engine.legacy.js)
   is untyped — these types describe its public contract so the new
   TS layer on top stays honest.                                     */

export type BotId = 'craft' | 'code';

/** High-level bot lifecycle state (Read.txt §1.3).
 *  - `idle`      — default; physics-only, no active dialogue
 *  - `greeting`  — first visit / boot-sequence-follow-up
 *  - `explaining`— responding to user command with substantive info
 *  - `thinking`  — mid-AI-lookup; typewriter pause / thinking dots
 *  - `glitch`    — error / unknown command / corrupted frame
 *  - `easter`    — hidden event, konami, idle easter egg          */
export type BotState =
  | 'idle'
  | 'greeting'
  | 'explaining'
  | 'thinking'
  | 'glitch'
  | 'easter';

/** One line inside a Scene (dialogues.data.js schema). */
export interface BotLine {
  who: BotId;
  text: string;
  /** Legacy action hint — bridges to CLIPS via STATE_TO_CLIP. */
  act?: 'wave' | 'surprised' | 'excited' | 'typing';
  /** Optional explicit clip name (overrides `act`). */
  clip?: string;
  /** Extra ms to hold bubble after typewriter finishes. */
  hold?: number;
  /** i18n key stamped at play-time — `dialogue.<scene.id>.l<N>` (1-based).
   *  Used by bubble renderers to resolve the localized string. */
  _key?: string;
}

export interface DialogueContext {
  flags: Record<string, unknown> & {
    rapport: number;
    chertyozh_7_step: number;
  };
  sim: {
    workshopTime: number;
    mood: Record<BotId, number>;
    curiosity: number;
    idleTimer: number;
    timePhase: 'morning' | 'day' | 'evening';
    [key: string]: unknown;
  };
  history: Array<{ id: string; t: number }>;
}

export interface Scene {
  id: string;
  tags: string[];
  weight?: number;
  cooldown?: number;
  requires?: (ctx: DialogueContext) => boolean;
  effect?: (ctx: DialogueContext) => void;
  lines: BotLine[];
}

/** Reply produced by bot.ai.ts for a user prompt in the fake terminal. */
export interface AIReply {
  state: BotState;
  lines: BotLine[];
  /** Scene tag to fire through the legacy engine for extra flavor. */
  fireTag?: string;
  /** Delay (ms) before first line starts typing. */
  delay?: number;
}

/** Input context passed to the AI handler. */
export interface AICtx {
  lang: 'en' | 'ru';
  rapport: number;
  /** Known plugin slugs, fed from manifest (Phase 3). */
  plugins: string[];
}

/** Shape exposed on `window.__companions` by the legacy engine. */
export interface LegacyCompanionsGlobal {
  dialogueState: 'idle' | 'talking';
  playSequence(lines: BotLine[]): void;
  /** Not originally part of the API — added by bot.engine.ts wrapper. */
  botState?: BotState;
  /** Fire a scene by tag, optionally remapping `craft`/`code` references. */
  fire?(tag: string, whoRemap?: BotId): boolean;
}

declare global {
  interface Window {
    __companions?: LegacyCompanionsGlobal;
    /** Emitted whenever bot.engine.ts transitions BotState. */
    __bots?: BotEngineHandle;
  }
}

export interface BotEngineHandle {
  getState(): BotState;
  setState(next: BotState, reason?: string): void;
  onStateChange(cb: (s: BotState) => void): () => void;
  say(who: BotId, text: string, opts?: { state?: BotState; hold?: number }): void;
  fire(tag: string, whoRemap?: BotId): boolean;
}
