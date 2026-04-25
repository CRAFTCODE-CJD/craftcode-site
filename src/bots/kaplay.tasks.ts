/* ══════════════════════════════════════════════════════
   CRAFTCODE — KAPLAY task system
   ══════════════════════════════════════════════════════
   Each bot now has a *current task* — a 20-60 s
   purposeful action chain — instead of pure random
   wander. Tasks chain off each other, biased by sim
   state (timePhase, mood, rapport), so a viewer reads
   intent and rhythm.

   Task lifecycle:
     · pickTaskFor(who)       — weighted random by sim
     · enterTask(who, task)   — set state, fire start
     · drive task tick        — k.loop(0.5) checks phase progress
     · exitTask(who)          — clear state, queue next task

   `bot.wanderDir` is owned by the engine's wander loop;
   while a task is active we override `wanderDir` directly
   and the wander RNG can't undo it because we keep it
   pinned every tick. To re-enable wander when a task
   ends we just stop pinning — the engine's wander
   re-rolls from there.

   Tasks are independent across bots (each bot runs its
   own task) BUT some tasks are "partner-needing"
   (chat_with_partner, argue, celebrate) — these bind
   both bots when launched. The arc system also reaches
   into the task system to drive joint flows.

   Public surface (window.__kcTasks):
     · current(who)            — TaskInstance|null
     · forceTask(who, id)      — debug
     · cancelTask(who)         — clears, lets next pick
     · isBusyJoint()           — true if a 2-bot task is live
                                                              */

import type { KaplayHandle, BotWho } from './kaplay.engine';
import type { GameObj } from 'kaplay';
import type { WorldState } from './kaplay.world';
import type { PacingState } from './kaplay.pacing';
import { makeWalkApi } from './kaplay.behavior-actions';

interface BotLikeTask extends GameObj {
  who: BotWho;
  isDragging: boolean;
  isGrounded: () => boolean;
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  flipX: boolean;
  wanderDir: -1 | 0 | 1;
  play: (clip: string) => void;
  jump: (n?: number) => void;
  _isSleeping?: boolean;
  _taskOwned?: boolean;
}

interface DialogueLikeTask {
  state: 'idle' | 'busy';
  fire(tag: string, who?: BotWho): boolean;
  quickBubble(who: BotWho, text: string, holdMs?: number): void;
  adjustRapport(delta: number): void;
  sim: {
    rapport: number;
    timePhase: 'morning' | 'day' | 'evening';
    mood: { craft: number; code: number };
  };
}

const getDialogue = (): DialogueLikeTask | null => {
  const w = window as unknown as { __dialogue?: DialogueLikeTask };
  return w.__dialogue ?? null;
};

// ── Task ID enum ───────────────────────────────────────
export type TaskId =
  | 'code_at_step'
  | 'hammer_at_crate'
  | 'think_at_floating'
  | 'coffee_break'
  | 'chat_with_partner'
  | 'inspect_event'
  | 'patrol'
  | 'rest_on_floating'
  | 'dance_solo'
  | 'nap_on_step'
  | 'argue'
  | 'celebrate';

interface TaskInstance {
  id: TaskId;
  startedAt: number;
  durationMs: number;
  // bot-local sub-phase ('approach' | 'work' | 'finish')
  phase: 'approach' | 'work' | 'finish';
  // Optional partner if joint task.
  partner: BotWho | null;
  // Cancellation flag set by exitTask() so any pending k.wait callback
  // sees the task no longer matches and bails.
  token: number;
  // Free bag for per-task state (e.g. eventTarget x).
  data: Record<string, unknown>;
}

export interface TasksHandle {
  current(who: BotWho): TaskInstance | null;
  forceTask(who: BotWho, id: TaskId): void;
  cancelTask(who: BotWho): void;
  isBusyJoint(): boolean;
  destroy(): void;
}

// ── World coordinates (mirrors kaplay.engine) ──────────
// We can't import private constants — recompute the same coordinates so
// tasks navigate to the same locations the engine drew the platforms at.
const FLOOR_TOP_Y = 408;
const STEP_X = 0.08;       // step_01: x = LOGICAL_W * 0.08
const STEP_Y = 320;        // raised — keep in sync with kaplay.engine.ts step_01.y
const STEP_W = 130;
const FLOAT_X = 0.38;      // floating_02: x = LOGICAL_W * 0.38
const FLOAT_Y = 290;
const FLOAT_W = 150;
const CRATE_RIGHT_PAD = 0.09;
const CRATE_W = 150;
const CRATE_Y = 230;
const KITCHEN_X_LO = 750;
const KITCHEN_X_HI = 820;

// ── Pickers ────────────────────────────────────────────
type Bias = Partial<Record<TaskId, number>>;

function biasFromSim(
  dlg: DialogueLikeTask | null,
  who: BotWho,
  jointAvailable: boolean,
): Bias {
  const bias: Bias = {};
  if (!dlg) return bias;
  const phase = dlg.sim.timePhase;
  const mood = dlg.sim.mood[who] ?? 50;
  const rapport = dlg.sim.rapport ?? 50;

  // timePhase
  if (phase === 'morning') {
    bias.coffee_break       = (bias.coffee_break ?? 1) + 1.5;
    bias.code_at_step       = (bias.code_at_step ?? 1) + 1.0;
    bias.dance_solo         = (bias.dance_solo ?? 1) + 0.5;
  } else if (phase === 'evening') {
    bias.rest_on_floating   = (bias.rest_on_floating ?? 1) + 1.5;
    bias.nap_on_step        = (bias.nap_on_step ?? 1) + 1.5;
    bias.chat_with_partner  = (bias.chat_with_partner ?? 1) + 0.8;
  } else {
    bias.code_at_step       = (bias.code_at_step ?? 1) + 0.5;
    bias.hammer_at_crate    = (bias.hammer_at_crate ?? 1) + 0.5;
  }

  // mood
  if (mood < 30) {
    bias.coffee_break       = (bias.coffee_break ?? 1) + 1.5;
    bias.rest_on_floating   = (bias.rest_on_floating ?? 1) + 0.8;
    if (jointAvailable) bias.argue = (bias.argue ?? 1) + 0.5;
  } else if (mood > 70) {
    if (jointAvailable) bias.celebrate = (bias.celebrate ?? 1) + 1.0;
    bias.dance_solo         = (bias.dance_solo ?? 1) + 0.8;
  }

  // rapport
  if (rapport < 30 && jointAvailable) {
    bias.argue              = (bias.argue ?? 1) + 1.5;
    bias.nap_on_step        = (bias.nap_on_step ?? 1) + 0.8;
    bias.chat_with_partner  = -10; // disable
  } else if (rapport > 70 && jointAvailable) {
    bias.chat_with_partner  = (bias.chat_with_partner ?? 1) + 1.5;
    bias.celebrate          = (bias.celebrate ?? 1) + 1.0;
  }

  return bias;
}

const TASK_BASE_WEIGHTS: Record<TaskId, number> = {
  code_at_step:       2.0,
  hammer_at_crate:    1.6,
  think_at_floating:  1.4,
  coffee_break:       1.6,
  chat_with_partner:  1.0,
  inspect_event:      0.0, // gated to event presence
  patrol:             1.6,
  rest_on_floating:   1.0,
  dance_solo:         0.7,
  nap_on_step:        0.7,
  argue:              0.0, // joint, opt-in via bias
  celebrate:          0.0, // joint, opt-in via bias
};

// Tasks that need both bots — only one can run at a time.
const JOINT_TASKS: TaskId[] = ['chat_with_partner', 'argue', 'celebrate'];

// ── Util ───────────────────────────────────────────────
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function installTasks(
  handle: KaplayHandle,
  world: WorldState,
  pacing: PacingState,
): TasksHandle {
  const k = handle.k;
  const { w: LOGICAL_W } = handle.logical;
  const craft = handle.bots.craft as unknown as BotLikeTask;
  const code  = handle.bots.code  as unknown as BotLikeTask;
  const bots: Record<BotWho, BotLikeTask> = { craft, code };

  const walk = makeWalkApi(handle);

  const current: Record<BotWho, TaskInstance | null> = { craft: null, code: null };
  let nextToken = 1;

  // Has at least one event-item live in scene?
  const hasLiveEventItem = (): GameObj | null => {
    const items = k.get('event-item');
    return items.length ? items[0] : null;
  };

  const isBusyJoint = (): boolean =>
    !!(current.craft?.partner || current.code?.partner);

  // Pick a task id for `who` weighted by sim + base.
  const pickTaskFor = (who: BotWho): TaskId => {
    const dlg = getDialogue();
    const partner: BotWho = who === 'craft' ? 'code' : 'craft';
    const partnerBot = bots[partner];
    const partnerFree =
      !current[partner] &&
      partnerBot.isGrounded() &&
      !partnerBot.isDragging &&
      !partnerBot._isSleeping;
    const jointAvailable = partnerFree && !isBusyJoint();
    const bias = biasFromSim(dlg, who, jointAvailable);
    const eventItem = hasLiveEventItem();
    const eventBoost = eventItem ? 4 : 0;

    const weights: Array<[TaskId, number]> = [];
    (Object.keys(TASK_BASE_WEIGHTS) as TaskId[]).forEach((id) => {
      let w = TASK_BASE_WEIGHTS[id] + (bias[id] ?? 0);
      if (id === 'inspect_event') w += eventBoost;
      // Joint tasks not allowed if partner busy / unavailable
      if (JOINT_TASKS.includes(id) && !jointAvailable) w = 0;
      // Don't repeat same task twice in a row
      if (current[who]?.id === id) w *= 0.2;
      if (w > 0) weights.push([id, w]);
    });
    if (!weights.length) return 'patrol';
    const total = weights.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * total;
    for (const [id, w] of weights) {
      r -= w;
      if (r <= 0) return id;
    }
    return weights[weights.length - 1][0];
  };

  // Simple "is bot eligible for tasks right now?"
  const eligible = (who: BotWho): boolean => {
    const b = bots[who];
    return !!b && b.isGrounded() && !b.isDragging && !b._isSleeping;
  };

  // Hand off control to the wander loop for a bit (cleared task slot).
  const exitTask = (who: BotWho) => {
    current[who] = null;
    const b = bots[who];
    try {
      b._taskOwned = false;
      b.wanderDir = 0;
      if (!b._isSleeping) b.play('idle');
    } catch (_) {}
  };

  // Set up a task and dispatch.
  const enterTask = (who: BotWho, id: TaskId) => {
    if (current[who]) return;
    const partner: BotWho = who === 'craft' ? 'code' : 'craft';
    const isJoint = JOINT_TASKS.includes(id);
    const inst: TaskInstance = {
      id,
      startedAt: performance.now(),
      durationMs: 30_000,
      phase: 'approach',
      partner: isJoint ? partner : null,
      token: ++nextToken,
      data: {},
    };
    current[who] = inst;
    try { bots[who]._taskOwned = true; } catch (_) {}
    if (isJoint) {
      // Mark partner as joint-bound too — share a partner-slot reference.
      current[partner] = {
        ...inst,
        partner: who,
        token: inst.token,
      };
      try { bots[partner]._taskOwned = true; } catch (_) {}
    }
    try { runTask(who, inst); } catch (_) { exitTask(who); if (isJoint) exitTask(partner); }
  };

  // ── Per-task implementations ─────────────────────────
  // Each implementation drives its own walk steps + animation, and calls
  // `finish()` when done. The shared tick (below) only watches for the
  // overall task duration as a safety net.

  const runTask = (who: BotWho, inst: TaskInstance): void => {
    const bot = bots[who];
    const dlg = getDialogue();

    const finish = () => {
      // Bail if the task was cancelled / replaced.
      if (current[who]?.token !== inst.token) return;
      const partner = inst.partner;
      exitTask(who);
      if (partner) exitTask(partner);
    };

    const fail = () => finish();

    // Wrapper: only run cb if this token still owns the slot.
    const stillMine = () => current[who]?.token === inst.token;

    switch (inst.id) {
      case 'code_at_step': {
        inst.durationMs = rand(30_000, 50_000);
        const targetX = LOGICAL_W * STEP_X + STEP_W * 0.5;
        walk.walkTo(who, targetX, () => {
          if (!stillMine()) return;
          // Try to hop up onto step_01. If we can't reach (fall down),
          // fall back to typing on the floor — viewer still gets the beat.
          try { if (bot.isGrounded()) bot.jump(420); } catch (_) {}
          k.wait(0.6, () => {
            if (!stillMine()) return;
            try { bot.play('typing'); bot.wanderDir = 0; } catch (_) {}
            inst.phase = 'work';
            // After 30-50s, "commit" and go back to ground.
            const workDur = (inst.durationMs - 1500) / 1000;
            k.wait(workDur, () => {
              if (!stillMine()) return;
              const d = getDialogue();
              if (d) d.quickBubble(who, 'commit ✓', 1500);
              try { world.flashCommit(); } catch (_) {}
              k.wait(1.6, finish);
            });
          });
        });
        break;
      }

      case 'hammer_at_crate': {
        inst.durationMs = rand(20_000, 35_000);
        const crateX = LOGICAL_W - LOGICAL_W * CRATE_RIGHT_PAD - CRATE_W * 0.5;
        walk.walkTo(who, crateX - 30, () => {
          if (!stillMine()) return;
          try { bot.flipX = false; bot.play('typing'); bot.wanderDir = 0; } catch (_) {}
          inst.phase = 'work';
          // Periodic mini-bubbles during the work phase.
          let beats = 0;
          const repeat = () => {
            if (!stillMine()) return;
            beats++;
            if (beats === 2) {
              const d = getDialogue();
              if (d) d.quickBubble(who, 'fix bug', 1300);
            }
            if (beats >= 4) {
              const d = getDialogue();
              if (d) d.quickBubble(who, 'shipped', 1500);
              try { world.flashFix(); } catch (_) {}
              k.wait(1.6, finish);
              return;
            }
            k.wait(rand(4, 7), repeat);
          };
          k.wait(2.0, repeat);
        });
        break;
      }

      case 'think_at_floating': {
        inst.durationMs = rand(20_000, 35_000);
        const targetX = LOGICAL_W * FLOAT_X + FLOAT_W * 0.5;
        walk.walkTo(who, targetX - 30, () => {
          if (!stillMine()) return;
          // Best effort hop onto floating_02. If we fall off, still play
          // think on the ground — narrative-equivalent.
          try { if (bot.isGrounded()) bot.jump(560); } catch (_) {}
          k.wait(0.7, () => {
            if (!stillMine()) return;
            try { bot.play('think'); bot.wanderDir = 0; } catch (_) {}
            inst.phase = 'work';
            // 25 s of think, with 1-2 monologues.
            k.wait(rand(8, 12), () => {
              if (!stillMine()) return;
              const d = getDialogue();
              if (d) d.quickBubble(who, '...', 1200);
            });
            k.wait(rand(16, 22), () => {
              if (!stillMine()) return;
              const d = getDialogue();
              if (d && d.state === 'idle') {
                if (!d.fire(`insight:${who}`)) d.quickBubble(who, '!', 1200);
              }
            });
            k.wait((inst.durationMs - 500) / 1000, finish);
          });
        });
        break;
      }

      case 'coffee_break': {
        inst.durationMs = rand(10_000, 14_000);
        const x = rand(KITCHEN_X_LO, KITCHEN_X_HI);
        walk.walkTo(who, x, () => {
          if (!stillMine()) return;
          try { bot.play('idle'); bot.wanderDir = 0; } catch (_) {}
          inst.phase = 'work';
          const d = getDialogue();
          if (d) d.quickBubble(who, '☕', 1500);
          // Coffee break boosts mood +5
          try { world.flashCoffee(); } catch (_) {}
          if (d) {
            const m = d.sim.mood;
            m[who] = clamp((m[who] ?? 50) + 5, 0, 100);
          }
          k.wait(8.5, finish);
        });
        break;
      }

      case 'chat_with_partner': {
        inst.durationMs = rand(12_000, 20_000);
        const partner = inst.partner!;
        const partnerBot = bots[partner];
        // Walk both toward midpoint.
        const mid = (bot.pos.x + partnerBot.pos.x) / 2;
        walk.walkTo(who, mid - 26);
        walk.walkTo(partner, mid + 26, () => {
          if (!stillMine()) return;
          try {
            bot.flipX = bot.pos.x > partnerBot.pos.x;
            partnerBot.flipX = partnerBot.pos.x > bot.pos.x;
            bot.play('idle'); partnerBot.play('idle');
          } catch (_) {}
          inst.phase = 'work';
          const d = getDialogue();
          if (d && d.state === 'idle') {
            // Fire an idle scene — covers gamut of small chat lines.
            d.fire('idle');
          }
          // Rapport tiny bump for chatting.
          if (d) d.adjustRapport(+1);
          k.wait(10, finish);
        });
        break;
      }

      case 'inspect_event': {
        inst.durationMs = 20_000;
        const item = hasLiveEventItem();
        if (!item) { fail(); return; }
        const targetX = (item.pos as { x: number }).x;
        walk.walkTo(who, targetX, () => {
          if (!stillMine()) return;
          try { bot.play('think'); bot.wanderDir = 0; } catch (_) {}
          inst.phase = 'work';
          k.wait(2.5, () => {
            if (!stillMine()) return;
            const d = getDialogue();
            if (d) {
              if (!d.fire('event:item_seen', who)) {
                d.quickBubble(who, '?', 1200);
              }
            }
            // Try to "consume" the item — destroy with a small sparkle.
            try {
              if (item.exists()) {
                const px = (item.pos as { x: number; y: number }).x;
                const py = (item.pos as { x: number; y: number }).y;
                item.destroy();
                for (let i = 0; i < 3; i++) {
                  k.add([
                    k.rect(3, 3),
                    k.pos(px + (Math.random() - 0.5) * 12, py),
                    k.color(234, 179, 8),
                    k.opacity(0.9),
                    k.lifespan(0.5, { fade: 0.4 }),
                    k.move(k.vec2((Math.random() - 0.5) * 30, -40), 50),
                  ]);
                }
              }
            } catch (_) {}
            k.wait(1.5, finish);
          });
        });
        break;
      }

      case 'patrol': {
        inst.durationMs = rand(6_000, 14_000);
        const dir = Math.random() < 0.5 ? -1 : 1;
        try { bot.wanderDir = dir; bot.flipX = dir < 0; bot.play('walk'); } catch (_) {}
        inst.phase = 'work';
        // Mid-patrol: chance to flip direction once.
        k.wait(inst.durationMs / 2 / 1000, () => {
          if (!stillMine()) return;
          if (Math.random() < 0.5) {
            try { bot.wanderDir = (-dir) as -1 | 1; bot.flipX = -dir < 0; } catch (_) {}
          }
        });
        k.wait(inst.durationMs / 1000, finish);
        break;
      }

      case 'rest_on_floating': {
        inst.durationMs = rand(20_000, 32_000);
        const targetX = LOGICAL_W * FLOAT_X + FLOAT_W * 0.5;
        walk.walkTo(who, targetX - 24, () => {
          if (!stillMine()) return;
          try { if (bot.isGrounded()) bot.jump(560); } catch (_) {}
          k.wait(0.7, () => {
            if (!stillMine()) return;
            try { bot.play('idle'); bot.wanderDir = 0; } catch (_) {}
            inst.phase = 'work';
            k.wait((inst.durationMs - 800) / 1000, finish);
          });
        });
        break;
      }

      case 'dance_solo': {
        inst.durationMs = rand(8_000, 12_000);
        try { bot.play('wave'); bot.wanderDir = 0; } catch (_) {}
        inst.phase = 'work';
        // Mood +3 per dance.
        const d = getDialogue();
        if (d) d.sim.mood[who] = clamp((d.sim.mood[who] ?? 50) + 3, 0, 100);
        k.wait(inst.durationMs / 1000, finish);
        break;
      }

      case 'nap_on_step': {
        inst.durationMs = rand(20_000, 38_000);
        const targetX = LOGICAL_W * STEP_X + STEP_W * 0.5;
        walk.walkTo(who, targetX, () => {
          if (!stillMine()) return;
          try { if (bot.isGrounded()) bot.jump(420); } catch (_) {}
          k.wait(0.6, () => {
            if (!stillMine()) return;
            try { bot.play('sleep'); bot.wanderDir = 0; } catch (_) {}
            inst.phase = 'work';
            // Mood/rapport restoration.
            const d = getDialogue();
            if (d) {
              d.sim.mood[who] = clamp((d.sim.mood[who] ?? 50) + 8, 0, 100);
            }
            try { world.flashNap(); } catch (_) {}
            k.wait((inst.durationMs - 700) / 1000, finish);
          });
        });
        break;
      }

      case 'argue': {
        inst.durationMs = rand(10_000, 16_000);
        const partner = inst.partner!;
        const partnerBot = bots[partner];
        const approach = partnerBot.pos.x + (bot.pos.x < partnerBot.pos.x ? -32 : 32);
        walk.walkTo(who, approach, () => {
          if (!stillMine()) return;
          try {
            bot.flipX = partnerBot.pos.x < bot.pos.x;
            partnerBot.flipX = bot.pos.x < partnerBot.pos.x;
            bot.play('excited'); partnerBot.play('excited');
          } catch (_) {}
          inst.phase = 'work';
          const d = getDialogue();
          if (d && d.state === 'idle') {
            // bumped_repeated:<who> reads "I'm done with this" — perfect
            // for an argue beat. Fall back to idle.tense if not eligible.
            if (!d.fire(`bumped_repeated:${who}`)) d.fire('idle');
          }
          if (d) d.adjustRapport(-3);
          k.wait(8, finish);
        });
        break;
      }

      case 'celebrate': {
        inst.durationMs = rand(8_000, 12_000);
        const partner = inst.partner!;
        const partnerBot = bots[partner];
        const mid = (bot.pos.x + partnerBot.pos.x) / 2;
        walk.walkTo(who, mid - 22);
        walk.walkTo(partner, mid + 22, () => {
          if (!stillMine()) return;
          try { bot.play('wave'); partnerBot.play('wave'); } catch (_) {}
          inst.phase = 'work';
          const d = getDialogue();
          if (d) {
            d.adjustRapport(+3);
            d.sim.mood[who] = clamp((d.sim.mood[who] ?? 50) + 5, 0, 100);
            d.sim.mood[partner] = clamp((d.sim.mood[partner] ?? 50) + 5, 0, 100);
          }
          k.wait(0.4, () => {
            if (!stillMine()) return;
            try { bot.jump(420); partnerBot.jump(420); } catch (_) {}
          });
          k.wait(7, finish);
        });
        break;
      }
    }

    // Safety net: if a task somehow stays alive past 1.5x duration — exit.
    k.wait((inst.durationMs / 1000) * 1.5 + 5, () => {
      if (current[who]?.token === inst.token) finish();
    });
  };

  // Decide whether to enter a new task for a free bot.
  // Called by the global tick. Skips bots that are: dragging, mid-air,
  // sleeping, OR if dialogue is busy (don't override scene-driven anims).
  const tryEnterTaskFor = (who: BotWho) => {
    if (current[who]) return;
    if (!eligible(who)) return;
    const dlg = getDialogue();
    if (dlg && dlg.state === 'busy') return;
    const id = pickTaskFor(who);
    // Some loud tasks gate on pacing burst — argue / celebrate.
    if ((id === 'argue' || id === 'celebrate') && !pacing.canBurst()) return;
    enterTask(who, id);
    if (id === 'argue' || id === 'celebrate') pacing.consumeBurst();
  };

  // ── Global tick ────────────────────────────────────────
  const tick = k.loop(0.5, () => {
    // If a bot got destroyed (drag-off-stage isn't possible but be safe),
    // its task slot stays — clear it so the picker can recover.
    (['craft', 'code'] as BotWho[]).forEach((who) => {
      const inst = current[who];
      if (!inst) return;
      const bot = bots[who];
      // If the bot got dragged mid-task, abort.
      if (bot.isDragging) {
        exitTask(who);
        if (inst.partner) exitTask(inst.partner);
        return;
      }
      // Hard timeout safety (3x duration as ABSOLUTE maximum).
      if (performance.now() - inst.startedAt > inst.durationMs * 3) {
        exitTask(who);
        if (inst.partner) exitTask(inst.partner);
      }
    });

    (['craft', 'code'] as BotWho[]).forEach(tryEnterTaskFor);
  });

  // Public surface
  const api: TasksHandle = {
    current(who) { return current[who]; },
    forceTask(who, id) {
      if (current[who]) {
        const partner = current[who]!.partner;
        exitTask(who);
        if (partner) exitTask(partner);
      }
      enterTask(who, id);
    },
    cancelTask(who) {
      const inst = current[who];
      if (!inst) return;
      const partner = inst.partner;
      exitTask(who);
      if (partner) exitTask(partner);
    },
    isBusyJoint,
    destroy() {
      try { (tick as { cancel?: () => void })?.cancel?.(); } catch (_) {}
      try { walk.destroy(); } catch (_) {}
      try { delete (window as unknown as { __kcTasks?: TasksHandle }).__kcTasks; } catch (_) {}
    },
  };

  if (typeof window !== 'undefined') {
    (window as unknown as { __kcTasks?: TasksHandle }).__kcTasks = api;
  }

  return api;
}
