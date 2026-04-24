/* ══════════════════════════════════════════════════════
   CRAFTCODE — KAPLAY behavior-action executor
   ══════════════════════════════════════════════════════
   Ports legacy `_runBehaviorAction(id)` from
   engine.legacy.js (commit f163e4d). Each behavior scene
   carries id `behavior.<name>`. When a scene is picked
   from the 'behavior' tier, this module's executor runs
   alongside the dialogue lines and physically nudges the
   bots so the dialogue reads as a real mini-routine.

   Implemented routines (subset matching legacy parity):
     · chase         — CRAFT walks to CODE, CODE retreats
     · ball_toss     — CODE windup, ball-arc DOM, CRAFT hifive
     · hifive        — both walk to mid, both wave
     · sync_nap      — both sleep ~3 s
     · stuck_corner  — CRAFT teleport to right edge + tumble
     · race          — both dash to opposite edges
     · dance_battle  — alternating wave clips
     · staring_contest, copy_me, pair_plank — fall through
       to dialog-only (no scripted physics).

   Public API: `installBehaviorActions(handle)` wires the
   executor into `dialogue.setBehaviorActionHook`.
                                                              */

import type { KaplayHandle, BotWho } from './kaplay.engine';
import type { GameObj } from 'kaplay';

interface DialogueLikeBeh {
  setBehaviorActionHook(fn: ((id: string) => void) | null): void;
}

const getDialogue = (): DialogueLikeBeh | null => {
  const w = window as unknown as { __dialogue?: DialogueLikeBeh };
  return w.__dialogue ?? null;
};

interface BotLike extends GameObj {
  who: BotWho;
  wanderDir: -1 | 0 | 1;
  isDragging: boolean;
  isGrounded: () => boolean;
  flipX: boolean;
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  walkTarget?: number | null;
  play: (clip: string) => void;
  jump: (n?: number) => void;
}

export function installBehaviorActions(handle: KaplayHandle): () => void {
  const k = handle.k;
  const { w: LOGICAL_W } = handle.logical;
  const SIDE_M = 24;
  const S = 32; // half-width fudge — bots are anchored centre

  const craft = handle.bots.craft as unknown as BotLike;
  const code  = handle.bots.code  as unknown as BotLike;
  const bots: Record<BotWho, BotLike> = { craft, code };
  const partnerOf = (who: BotWho): BotWho => (who === 'craft' ? 'code' : 'craft');

  const clampX = (x: number) => Math.max(SIDE_M, Math.min(LOGICAL_W - SIDE_M - S, x));

  // KAPLAY bots don't have `walkTarget`; we drive them by stamping a
  // target on the bot object and letting a per-frame steerer move them
  // toward it (similar to legacy `walkTo`).
  const steerTarget: Record<BotWho, number | null> = { craft: null, code: null };
  const arriveCb:    Record<BotWho, (() => void) | null> = { craft: null, code: null };

  const onUpdate = k.onUpdate(() => {
    (['craft', 'code'] as BotWho[]).forEach((who) => {
      const target = steerTarget[who];
      if (target == null) return;
      const bot = bots[who];
      if (!bot || bot.isDragging) {
        steerTarget[who] = null; arriveCb[who] = null; return;
      }
      const dx = target - bot.pos.x;
      const ad = Math.abs(dx);
      if (ad < 6) {
        steerTarget[who] = null;
        try { bot.wanderDir = 0; bot.play('idle'); } catch (_) {}
        const cb = arriveCb[who];
        arriveCb[who] = null;
        if (cb) try { cb(); } catch (_) {}
        return;
      }
      const dir = dx > 0 ? 1 : -1;
      bot.flipX = dir < 0;
      bot.wanderDir = dir as 1 | -1;
      try { bot.play('walk'); } catch (_) {}
      // 90 px/s — slightly faster than ambient wander (60) for purposeful
      // motion. KAPLAY moves are velocity-style; per-frame integration
      // happens in the engine's onUpdate via bot.move().
      bot.pos.x += dir * 90 * k.dt();
    });
  });

  const walkTo = (who: BotWho, tx: number, onArrive?: () => void) => {
    steerTarget[who] = clampX(tx);
    arriveCb[who] = onArrive ?? null;
  };

  const safePlay = (who: BotWho, clip: string) => {
    try { bots[who].play(clip); } catch (_) {}
  };

  // Decorative ball that arcs from `from` bot to `to` bot — visual
  // companion to behavior.ball_toss. Lives ~1.2 s then disappears.
  const spawnBallArc = (fromWho: BotWho, toWho: BotWho) => {
    const from = bots[fromWho];
    const to   = bots[toWho];
    try {
      // Build at midpoint above sender; tween via two-step KAPLAY tweens.
      const startX = from.pos.x;
      const startY = from.pos.y - 28;
      const endX   = to.pos.x;
      const endY   = to.pos.y - 28;
      // No k.outline() — its component update crashed when we tried it
      // on the floor button; just use a solid filled circle.
      const ball = k.add([
        k.circle(7),
        k.pos(startX, startY),
        k.color(255, 215, 64),
        k.opacity(0.95),
        k.lifespan(1.2, { fade: 0.4 }),
        'event-entity',
      ]);
      const dur = 0.35;
      const apexY = Math.min(startY, endY) - 70;
      // Up-arc.
      try {
        if (typeof (k as unknown as { tween?: unknown }).tween === 'function') {
          (k as unknown as {
            tween: (a: number, b: number, d: number, set: (v: number) => void) => unknown;
          }).tween(startX, (startX + endX) / 2, dur, (v) => { ball.pos.x = v; });
          (k as unknown as {
            tween: (a: number, b: number, d: number, set: (v: number) => void) => unknown;
          }).tween(startY, apexY, dur, (v) => { ball.pos.y = v; });
        }
      } catch (_) {}
      // Down-arc + fade out a moment after apex.
      k.wait(dur, () => {
        try {
          if (typeof (k as unknown as { tween?: unknown }).tween === 'function') {
            (k as unknown as {
              tween: (a: number, b: number, d: number, set: (v: number) => void) => unknown;
            }).tween((startX + endX) / 2, endX, dur, (v) => { if (ball.exists()) ball.pos.x = v; });
            (k as unknown as {
              tween: (a: number, b: number, d: number, set: (v: number) => void) => unknown;
            }).tween(apexY, endY, dur, (v) => { if (ball.exists()) ball.pos.y = v; });
          }
        } catch (_) {}
      });
    } catch (_) { /* graceful */ }
  };

  const runAction = (id: string) => {
    switch (id) {
      case 'behavior.chase': {
        // CRAFT walks toward CODE; once close, CODE retreats 120 px.
        walkTo('craft', code.pos.x - 30);
        k.wait(0.9, () => {
          if (!code.isGrounded()) return;
          const dir = code.pos.x > craft.pos.x ? 1 : -1;
          walkTo('code', code.pos.x + dir * 120);
        });
        break;
      }
      case 'behavior.ball_toss': {
        safePlay('code', 'wave');
        spawnBallArc('code', 'craft');
        k.wait(0.6, () => safePlay('craft', 'wave'));
        break;
      }
      case 'behavior.hifive':
      case 'behavior.highfive': {
        const mid = (craft.pos.x + code.pos.x) / 2;
        walkTo('craft', mid - 24, () => safePlay('craft', 'wave'));
        walkTo('code',  mid + 24, () => safePlay('code',  'wave'));
        break;
      }
      case 'behavior.sync_nap': {
        safePlay('craft', 'sleep');
        safePlay('code',  'sleep');
        k.wait(3.5, () => {
          safePlay('craft', 'idle');
          safePlay('code',  'idle');
        });
        break;
      }
      case 'behavior.stuck_corner': {
        // Teleport CRAFT to the right edge and play tumble.
        try { craft.pos.x = LOGICAL_W - SIDE_M - S; } catch (_) {}
        safePlay('craft', 'tumble');
        k.wait(2.2, () => safePlay('craft', 'idle'));
        break;
      }
      case 'behavior.race': {
        walkTo('craft', SIDE_M + 10);
        walkTo('code',  LOGICAL_W - SIDE_M - 10 - S);
        break;
      }
      case 'behavior.dance_battle': {
        safePlay('craft', 'wave');
        k.wait(0.4, () => safePlay('code', 'wave'));
        k.wait(1.2, () => safePlay('craft', 'wave'));
        break;
      }
      case 'behavior.poke_loop':
      case 'behavior.copy_me': {
        // Mirror partner's facing — small, low-impact gag.
        const facing = craft.pos.x < code.pos.x ? false : true;
        try { craft.flipX = facing; code.flipX = !facing; } catch (_) {}
        break;
      }
      case 'behavior.staring_contest':
      case 'behavior.shadow_play':
      case 'behavior.hide_seek':
      case 'behavior.rock_paper':
      case 'behavior.pair_plank':
      case 'behavior.echo_canyon':
      default:
        // Dialog-only behaviors — no scripted physics. (Parity with legacy.)
        break;
    }
  };

  // Wire into the bridge.
  const dlg = getDialogue();
  if (dlg) dlg.setBehaviorActionHook(runAction);

  // Used by ai-loop's wrapper too, so they can chain promises.
  return () => {
    try { onUpdate?.cancel?.(); } catch (_) {}
    if (dlg) dlg.setBehaviorActionHook(null);
  };
}

// Exposed for AI-loop's toss scene — uses the same walk-and-arrive
// primitive without the full behavior installer.
export interface WalkApi {
  walkTo(who: BotWho, tx: number, onArrive?: () => void): void;
}
export function makeWalkApi(handle: KaplayHandle): WalkApi & { destroy(): void } {
  const k = handle.k;
  const { w: LOGICAL_W } = handle.logical;
  const SIDE_M = 24;
  const S = 32;
  const clampX = (x: number) => Math.max(SIDE_M, Math.min(LOGICAL_W - SIDE_M - S, x));

  const target: Record<BotWho, number | null> = { craft: null, code: null };
  const arrive: Record<BotWho, (() => void) | null> = { craft: null, code: null };
  const sprint: Record<BotWho, boolean> = { craft: false, code: false };

  const tick = k.onUpdate(() => {
    (['craft', 'code'] as BotWho[]).forEach((who) => {
      const t = target[who];
      if (t == null) return;
      const bot = handle.bots[who] as unknown as BotLike;
      if (!bot || bot.isDragging) {
        target[who] = null; arrive[who] = null; sprint[who] = false; return;
      }
      const dx = t - bot.pos.x;
      const ad = Math.abs(dx);
      if (ad < 6) {
        target[who] = null;
        sprint[who] = false;
        try { bot.wanderDir = 0; bot.play('idle'); } catch (_) {}
        const cb = arrive[who];
        arrive[who] = null;
        if (cb) try { cb(); } catch (_) {}
        return;
      }
      const dir = dx > 0 ? 1 : -1;
      bot.flipX = dir < 0;
      bot.wanderDir = dir as 1 | -1;
      try { bot.play('walk'); } catch (_) {}
      const speed = sprint[who] ? 160 : 90;
      bot.pos.x += dir * speed * k.dt();
    });
  });

  return {
    walkTo(who: BotWho, tx: number, onArrive?: () => void) {
      target[who] = clampX(tx);
      arrive[who] = onArrive ?? null;
      sprint[who] = false;
    },
    destroy() { try { tick?.cancel?.(); } catch (_) {} },
  };
}
