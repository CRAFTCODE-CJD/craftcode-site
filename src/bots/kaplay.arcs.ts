/* ══════════════════════════════════════════════════════
   CRAFTCODE — KAPLAY mini-arc state machine
   ══════════════════════════════════════════════════════
   Mini-arcs are 30-90 s scripted micro-stories with
   beats. Unlike tasks (single-bot focused intent),
   arcs coordinate BOTH bots and trigger off either
   chance or sim conditions. Only ONE arc runs at a time.

   Arc lifecycle:
     · pickArc()     — chooses by weight + sim
     · startArc()    — preempts current tasks, sets mutex
     · arc beats     — scheduled via k.wait so destroy()
                       cancels them automatically
     · endArc()      — clears mutex, lets tasks resume

   Arc trigger frequency: every 60-180 s (with pacing
   gate — we only allow during burst phase). Reactive
   arcs (crash_and_laugh) bypass the pacing gate
   because they're event-driven, not scheduled.

   Implemented arcs:
     · coffee_race            — both rush to spawn coffee
     · pair_programming       — joint typing on step
     · crash_and_laugh        — partner reacts to a hard fall
     · insight_chain          — think → reaction → both jump
     · argue_and_make_up      — argue → nap → reconcile
     · platform_discovery     — investigate new platform
     · konami_theatre         — synchronized wave dance

   The arc system reads `__kcTasks` to cancel ambient
   tasks before scripting bots. Restoring control happens
   automatically when `endArc()` is called — the tasks
   tick will find both slots empty and re-pick.
                                                              */

import type { KaplayHandle, BotWho } from './kaplay.engine';
import type { GameObj } from 'kaplay';
import type { TasksHandle } from './kaplay.tasks';
import type { WorldState } from './kaplay.world';
import type { PacingState } from './kaplay.pacing';
import { makeWalkApi } from './kaplay.behavior-actions';

interface BotLikeArc extends GameObj {
  who: BotWho;
  isDragging: boolean;
  isGrounded: () => boolean;
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  flipX: boolean;
  wanderDir: -1 | 0 | 1;
  play: (clip: string) => void;
  jump: (n?: number) => void;
  _taskOwned?: boolean;
}

interface DialogueLikeArc {
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

const getDialogue = (): DialogueLikeArc | null => {
  const w = window as unknown as { __dialogue?: DialogueLikeArc };
  return w.__dialogue ?? null;
};

type ArcId =
  | 'coffee_race'
  | 'pair_programming'
  | 'crash_and_laugh'
  | 'insight_chain'
  | 'argue_and_make_up'
  | 'platform_discovery'
  | 'konami_theatre';

interface ActiveArc {
  id: ArcId;
  startedAt: number;
  token: number;
}

export interface ArcsHandle {
  current(): ActiveArc | null;
  trigger(id: ArcId): boolean;
  destroy(): void;
}

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function installArcs(
  handle: KaplayHandle,
  tasks: TasksHandle,
  world: WorldState,
  pacing: PacingState,
): ArcsHandle {
  const k = handle.k;
  const { w: LOGICAL_W } = handle.logical;
  const craft = handle.bots.craft as unknown as BotLikeArc;
  const code  = handle.bots.code  as unknown as BotLikeArc;
  const bots: Record<BotWho, BotLikeArc> = { craft, code };

  // Walk API specifically for arc choreography. Separate from tasks' walk
  // so cancelling arc clears its own targets without touching task walks.
  const walk = makeWalkApi(handle);

  let active: ActiveArc | null = null;
  let nextToken = 1;

  const stillMine = (token: number) => active?.token === token;

  const stopBoth = () => {
    tasks.cancelTask('craft');
    tasks.cancelTask('code');
    // Arc takes ownership of both bots while it's running.
    try { craft._taskOwned = true; code._taskOwned = true; } catch (_) {}
  };

  const endArc = (token: number) => {
    if (active?.token !== token) return;
    active = null;
    try {
      craft._taskOwned = false; code._taskOwned = false;
      craft.wanderDir = 0; code.wanderDir = 0;
    } catch (_) {}
  };

  // ── Arc impls ──────────────────────────────────────────

  const arcCoffeeRace = (token: number, target: GameObj) => {
    const tx = (target.pos as { x: number }).x;
    const dlg = getDialogue();
    // Both bots drop tasks, freeze 0.5s, then race.
    stopBoth();
    if (dlg) dlg.quickBubble(Math.random() < 0.5 ? 'craft' : 'code', '☕!', 1100);

    // Distance-based winner: nearer bot reaches first.
    const dCraft = Math.abs(craft.pos.x - tx);
    const dCode  = Math.abs(code.pos.x  - tx);
    const winner: BotWho = dCraft <= dCode ? 'craft' : 'code';
    const loser:  BotWho = winner === 'craft' ? 'code' : 'craft';

    k.wait(0.5, () => {
      if (!stillMine(token)) return;
      walk.walkTo(winner, tx, () => {
        if (!stillMine(token)) return;
        try {
          // Try to consume the coffee item.
          if (target.exists()) target.destroy();
          (bots[winner]).play('excited');
          (bots[loser]).play('think');
          world.flashCoffee();
          if (dlg) {
            dlg.quickBubble(winner, 'mine!', 1300);
            dlg.sim.mood[winner] = clamp((dlg.sim.mood[winner] ?? 50) + 10, 0, 100);
            dlg.sim.mood[loser]  = clamp((dlg.sim.mood[loser]  ?? 50) - 5, 0, 100);
          }
        } catch (_) {}
        k.wait(2.0, () => {
          if (!stillMine(token)) return;
          if (dlg) dlg.quickBubble(loser, 'next time', 1400);
          k.wait(2.0, () => endArc(token));
        });
      });
      walk.walkTo(loser, tx + (winner === 'craft' ? 60 : -60));
    });
  };

  const arcPairProgramming = (token: number) => {
    stopBoth();
    const dlg = getDialogue();
    // Both walk to step_01 area and "type". Mood + rapport + commit.
    const stepX = LOGICAL_W * 0.08 + 65;
    walk.walkTo('craft', stepX - 18);
    walk.walkTo('code',  stepX + 18, () => {
      if (!stillMine(token)) return;
      try { craft.play('typing'); code.play('typing'); craft.flipX = false; code.flipX = true; } catch (_) {}
      if (dlg) dlg.quickBubble('craft', 'pair?', 1200);
      k.wait(2.0, () => {
        if (!stillMine(token)) return;
        if (dlg) dlg.quickBubble('code', 'pair.', 1200);
      });
      k.wait(20, () => {
        if (!stillMine(token)) return;
        if (dlg) {
          dlg.quickBubble('craft', 'commit ✓', 1300);
          dlg.adjustRapport(+5);
          dlg.sim.mood.craft = clamp((dlg.sim.mood.craft ?? 50) + 5, 0, 100);
          dlg.sim.mood.code  = clamp((dlg.sim.mood.code  ?? 50) + 5, 0, 100);
        }
        try { world.flashCommit(); } catch (_) {}
        k.wait(2.0, () => endArc(token));
      });
    });
  };

  const arcCrashAndLaugh = (token: number, victim: BotWho) => {
    const partner: BotWho = victim === 'craft' ? 'code' : 'craft';
    const dlg = getDialogue();
    stopBoth();
    // Partner faces victim and reacts.
    try { bots[partner].flipX = bots[victim].pos.x < bots[partner].pos.x; bots[partner].play('excited'); } catch (_) {}
    if (dlg) {
      if (!dlg.fire(`partner_on_land_hard:${victim}`)) {
        dlg.quickBubble(partner, 'lol', 1300);
      }
      dlg.adjustRapport(+1);
    }
    k.wait(3.0, () => endArc(token));
  };

  const arcInsightChain = (token: number) => {
    stopBoth();
    const initiator: BotWho = Math.random() < 0.5 ? 'craft' : 'code';
    const partner: BotWho = initiator === 'craft' ? 'code' : 'craft';
    const dlg = getDialogue();
    // Initiator walks to floating, climbs, thinks, then both celebrate.
    const fx = LOGICAL_W * 0.38 + 75;
    walk.walkTo(initiator, fx - 24, () => {
      if (!stillMine(token)) return;
      try { if (bots[initiator].isGrounded()) bots[initiator].jump(560); } catch (_) {}
      k.wait(0.7, () => {
        if (!stillMine(token)) return;
        try { bots[initiator].play('think'); bots[initiator].wanderDir = 0; } catch (_) {}
        k.wait(3, () => {
          if (!stillMine(token)) return;
          if (dlg) {
            if (!dlg.fire(`insight:${initiator}`)) dlg.quickBubble(initiator, '!', 1200);
          }
          k.wait(2.0, () => {
            if (!stillMine(token)) return;
            // Partner reacts.
            try { bots[partner].flipX = bots[initiator].pos.x < bots[partner].pos.x; bots[partner].play('excited'); } catch (_) {}
            if (dlg) dlg.quickBubble(partner, 'oh!', 1100);
            k.wait(1.6, () => {
              if (!stillMine(token)) return;
              // Both jump + wave.
              try { bots[initiator].jump(420); bots[partner].jump(420); } catch (_) {}
              k.wait(0.6, () => {
                if (!stillMine(token)) return;
                try { bots[initiator].play('wave'); bots[partner].play('wave'); } catch (_) {}
                if (dlg) dlg.adjustRapport(+3);
                k.wait(2.5, () => endArc(token));
              });
            });
          });
        });
      });
    });
  };

  const arcArgueAndMakeUp = (token: number) => {
    stopBoth();
    const dlg = getDialogue();
    const a: BotWho = Math.random() < 0.5 ? 'craft' : 'code';
    const b: BotWho = a === 'craft' ? 'code' : 'craft';
    // Beat 1: argue
    const mid = (craft.pos.x + code.pos.x) / 2;
    walk.walkTo(a, mid - 22);
    walk.walkTo(b, mid + 22, () => {
      if (!stillMine(token)) return;
      try { bots[a].play('excited'); bots[b].play('excited'); } catch (_) {}
      if (dlg) {
        if (!dlg.fire(`bumped_repeated:${a}`)) dlg.quickBubble(a, '!!', 1100);
        dlg.adjustRapport(-4);
      }
      // Beat 2: a walks off to nap on step
      k.wait(5, () => {
        if (!stillMine(token)) return;
        const stepX = LOGICAL_W * 0.08 + 65;
        walk.walkTo(a, stepX, () => {
          if (!stillMine(token)) return;
          try { if (bots[a].isGrounded()) bots[a].jump(420); } catch (_) {}
          k.wait(0.6, () => {
            if (!stillMine(token)) return;
            try { bots[a].play('sleep'); bots[a].wanderDir = 0; } catch (_) {}
            // Beat 3: b approaches gently
            k.wait(4, () => {
              if (!stillMine(token)) return;
              walk.walkTo(b, stepX + 30, () => {
                if (!stillMine(token)) return;
                try { bots[b].play('idle'); } catch (_) {}
                if (dlg) {
                  if (!dlg.fire(`gentle_touch:${a}`)) dlg.quickBubble(b, 'sorry', 1500);
                  dlg.adjustRapport(+10);
                }
                // Beat 4: a wakes
                k.wait(2.0, () => {
                  if (!stillMine(token)) return;
                  try { bots[a].play('idle'); } catch (_) {}
                  if (dlg) {
                    if (!dlg.fire('reconciliation')) dlg.quickBubble(a, 'ok', 1200);
                    dlg.adjustRapport(+5);
                  }
                  k.wait(2.5, () => endArc(token));
                });
              });
            });
          });
        });
      });
    });
  };

  const arcPlatformDiscovery = (token: number, plat: GameObj) => {
    stopBoth();
    const dlg = getDialogue();
    const px = (plat.pos as { x: number }).x;
    // Pick the nearer bot to investigate.
    const investigator: BotWho =
      Math.abs(craft.pos.x - px) <= Math.abs(code.pos.x - px) ? 'craft' : 'code';
    walk.walkTo(investigator, px, () => {
      if (!stillMine(token)) return;
      try { bots[investigator].play('think'); bots[investigator].wanderDir = 0; } catch (_) {}
      if (dlg) dlg.quickBubble(investigator, '?', 1200);
      k.wait(2.5, () => {
        if (!stillMine(token)) return;
        // Hop up.
        try { if (bots[investigator].isGrounded()) bots[investigator].jump(560); } catch (_) {}
        k.wait(1.0, () => {
          if (!stillMine(token)) return;
          try { bots[investigator].play('wave'); } catch (_) {}
          if (dlg) {
            if (!dlg.fire('event:platform_appear')) dlg.quickBubble(investigator, 'new!', 1300);
          }
          k.wait(2.5, () => endArc(token));
        });
      });
    });
  };

  const arcKonamiTheatre = (token: number) => {
    stopBoth();
    const dlg = getDialogue();
    try { craft.play('wave'); code.play('wave'); } catch (_) {}
    // Beat: alternating jumps in sequence (↑↑↓↓ feel).
    k.wait(0.4, () => { if (stillMine(token)) try { craft.jump(420); } catch (_) {} });
    k.wait(0.8, () => { if (stillMine(token)) try { code.jump(420); } catch (_) {} });
    k.wait(1.6, () => { if (stillMine(token)) try { craft.jump(380); code.jump(380); } catch (_) {} });
    k.wait(2.6, () => {
      if (!stillMine(token)) return;
      if (dlg && dlg.state === 'idle') {
        if (!dlg.fire('konami')) dlg.quickBubble('craft', '↑↑↓↓BA', 1500);
      }
      if (dlg) dlg.adjustRapport(+2);
      k.wait(3.0, () => endArc(token));
    });
  };

  // ── Picker ─────────────────────────────────────────────
  const arcWeights = (): Array<[ArcId, number]> => {
    const dlg = getDialogue();
    const out: Array<[ArcId, number]> = [];
    const r = dlg?.sim.rapport ?? 50;
    const phase = dlg?.sim.timePhase ?? 'day';
    const moodAvg = ((dlg?.sim.mood.craft ?? 50) + (dlg?.sim.mood.code ?? 50)) / 2;

    out.push(['pair_programming', phase === 'morning' ? 2.5 : 1.0]);
    out.push(['insight_chain', 1.5]);
    out.push(['konami_theatre', moodAvg > 70 ? 1.0 : 0.4]);
    if (r < 35) out.push(['argue_and_make_up', 2.5]);
    if (r > 65) out.push(['konami_theatre', 1.0]);

    // coffee_race / platform_discovery require an entity, weight=0 so the
    // picker only emits them when entity-triggered. They go through the
    // explicit reactive path below.
    return out;
  };

  const pickArc = (): ArcId => {
    const w = arcWeights();
    if (!w.length) return 'pair_programming';
    const total = w.reduce((a, [, x]) => a + x, 0);
    let r = Math.random() * total;
    for (const [id, x] of w) {
      r -= x;
      if (r <= 0) return id;
    }
    return w[w.length - 1][0];
  };

  // ── Trigger gate ───────────────────────────────────────
  const startArc = (id: ArcId, force = false): boolean => {
    if (active) return false;
    if (!force && !pacing.canBurst()) return false;
    const dlg = getDialogue();
    if (dlg && dlg.state === 'busy') return false;
    // Bots must be reachable.
    if (craft.isDragging || code.isDragging) return false;

    const token = ++nextToken;
    active = { id, startedAt: performance.now(), token };
    if (!force) pacing.consumeBurst();

    switch (id) {
      case 'coffee_race': {
        // Need a coffee item present.
        const items = k.get('event-item').filter((it: GameObj) => {
          const kind = (it as unknown as { kind?: string }).kind;
          return kind === 'coffee';
        });
        if (!items.length) { active = null; return false; }
        arcCoffeeRace(token, items[0]);
        return true;
      }
      case 'pair_programming': arcPairProgramming(token); return true;
      case 'crash_and_laugh': {
        // Find which bot is mid-air with high downward vel.
        const v: BotWho | null =
          Math.abs(craft.vel.y) > Math.abs(code.vel.y) ? 'craft' : 'code';
        arcCrashAndLaugh(token, v);
        return true;
      }
      case 'insight_chain':       arcInsightChain(token);       return true;
      case 'argue_and_make_up':   arcArgueAndMakeUp(token);     return true;
      case 'platform_discovery': {
        const platforms = k.get('event-platform');
        if (!platforms.length) { active = null; return false; }
        arcPlatformDiscovery(token, platforms[0]);
        return true;
      }
      case 'konami_theatre':      arcKonamiTheatre(token);      return true;
    }
    active = null;
    return false;
  };

  // Scheduled arcs — every 60-180s, picker chooses by weight.
  const scheduleNext = () => {
    const delay = rand(60, 180);
    k.wait(delay, () => {
      const id = pickArc();
      startArc(id, false);
      scheduleNext();
    });
  };
  scheduleNext();

  // Reactive: on event-item with kind=coffee, attempt coffee_race.
  let lastItemSeen = 0;
  const itemTick = k.loop(0.5, () => {
    const items = k.get('event-item');
    if (!items.length) return;
    // Only one trigger per spawn — debounce by id reference.
    const it = items[0];
    const sig = (it as unknown as { _sig?: number })._sig
      ?? Math.floor(((it.pos as { x: number }).x) * 10) + Math.floor(((it.pos as { y: number }).y) * 10);
    if (sig === lastItemSeen) return;
    lastItemSeen = sig;
    const kind = (it as unknown as { kind?: string }).kind;
    if (kind === 'coffee' && Math.random() < 0.5) {
      // Force-allow during calm too: coffee race is too good to miss.
      startArc('coffee_race', true);
    }
  });

  // Reactive: on platform_appear, sometimes trigger discovery arc.
  let lastPlatSeen = 0;
  const platTick = k.loop(0.5, () => {
    const plats = k.get('event-platform');
    if (!plats.length) return;
    const p = plats[0];
    const sig = Math.floor(((p.pos as { x: number }).x) * 10);
    if (sig === lastPlatSeen) return;
    lastPlatSeen = sig;
    if (Math.random() < 0.5) startArc('platform_discovery', true);
  });

  // Reactive: hard-fall detection. Watch downward velocity at landing.
  const lastVy: Record<BotWho, number> = { craft: 0, code: 0 };
  const fallTick = k.onUpdate(() => {
    (['craft', 'code'] as BotWho[]).forEach((who) => {
      const bot = bots[who];
      const prev = lastVy[who];
      const cur = bot.vel.y;
      // Hard land: vy was > 600 and now (after onGround) is ~0 — i.e. cur drops from prev fast.
      if (prev > 600 && cur < 100 && bot.isGrounded()) {
        // Avoid triggering during drag releases (drag clears vel via tumble).
        if (!bot.isDragging && Math.random() < 0.4) {
          startArc('crash_and_laugh', true);
        }
      }
      lastVy[who] = cur;
    });
  });

  const api: ArcsHandle = {
    current() { return active; },
    trigger(id) { return startArc(id, true); },
    destroy() {
      try { (itemTick as { cancel?: () => void })?.cancel?.(); } catch (_) {}
      try { (platTick as { cancel?: () => void })?.cancel?.(); } catch (_) {}
      try { (fallTick as { cancel?: () => void })?.cancel?.(); } catch (_) {}
      try { walk.destroy(); } catch (_) {}
      try { delete (window as unknown as { __kcArcs?: ArcsHandle }).__kcArcs; } catch (_) {}
    },
  };
  if (typeof window !== 'undefined') {
    (window as unknown as { __kcArcs?: ArcsHandle }).__kcArcs = api;
  }
  return api;
}
