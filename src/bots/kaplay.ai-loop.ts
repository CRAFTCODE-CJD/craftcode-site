/* ══════════════════════════════════════════════════════
   CRAFTCODE — KAPLAY top-level AI scheduler
   ══════════════════════════════════════════════════════
   The "soul" loop: makes the bots feel alive without any
   user input. Mirrors the legacy engine's interlocking
   timers (engine.legacy.js):

     · idle dialogue       every 8-30 s, dialogue.fire('idle')
     · inner monologue     every 15-40 s, 20% chance, quickBubble
     · thinking sequence   every 50-90 s, think clip + scene
     · toss scene          every 80-170 s, intro then physical toss
     · floor-button        bot proximity → press anim → fire button_pressed

   All schedulers use k.wait/k.loop so cancellation is trivial
   on destroy(). They guard against `dialogue.state === 'busy'`
   and `bot.isDragging` / airborne state.
                                                              */

import type { KaplayHandle, BotWho } from './kaplay.engine';
import type { GameObj } from 'kaplay';
import { makeWalkApi } from './kaplay.behavior-actions';

interface BotLikeAI extends GameObj {
  who: BotWho;
  isDragging: boolean;
  isGrounded: () => boolean;
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  flipX: boolean;
  wanderDir: -1 | 0 | 1;
  play: (clip: string) => void;
  jump: (n?: number) => void;
}

interface DialogueLikeAI {
  state: 'idle' | 'busy';
  fire(tag: string, who?: BotWho): boolean;
  pick(tag: string): { id: string; cooldown?: number; lines: { who: BotWho; text: string; hold?: number }[] } | null;
  play(scene: { id: string; cooldown?: number; lines: { who: BotWho; text: string; hold?: number }[] }): { who: BotWho; text: string; hold?: number; _key?: string }[];
  playSequence(lines: { who: BotWho; text: string; hold?: number; _key?: string }[]): Promise<void>;
  quickBubble(who: BotWho, text: string, holdMs?: number): void;
  setFloorButtonHook(fn: (() => void) | null): void;
  adjustRapport(delta: number): void;
  recordBump(): void;
  sim: { mood: { craft: number; code: number }; rapport: number; bumps: number };
}

const getDialogue = (): DialogueLikeAI | null => {
  const w = window as unknown as { __dialogue?: DialogueLikeAI };
  return w.__dialogue ?? null;
};

const resolveI18n = (key: string, fallback: string): string => {
  try {
    const w = window as unknown as { __i18n?: { t?: (k: string) => string } };
    const t = w.__i18n?.t;
    if (typeof t === 'function') {
      const v = t(key);
      if (typeof v === 'string' && v.length && v !== key) return v;
    }
  } catch (_) { /* noop */ }
  return fallback;
};

// Pool fallback (used if i18n is offline). Mirrors legacy POOL.
const MONOLOGUE_FALLBACK = [
  '...hmm', 'almost ready', 'tl;dr', 'lol', 'brb', 'zzz',
  'o_O', 'wait what', 'yep', 'ok', '...', 'kinda', 'hm',
  'meh', 'sure sure',
];

export interface AILoopHandle {
  destroy(): void;
}

export function startAILoop(handle: KaplayHandle, opts: { reducedMotion?: boolean } = {}): AILoopHandle {
  const k = handle.k;
  const reduced = !!opts.reducedMotion;
  const craft = handle.bots.craft as unknown as BotLikeAI;
  const code  = handle.bots.code  as unknown as BotLikeAI;

  const walk = makeWalkApi(handle);

  // ── Common gating ────────────────────────────────────
  const bothIdleGrounded = (): boolean => {
    return craft.isGrounded() && code.isGrounded()
      && !craft.isDragging && !code.isDragging
      && !!getDialogue() && getDialogue()!.state === 'idle';
  };

  // ── 1. Idle dialogue every 8-30 s ────────────────────
  const idleTimers: ReturnType<typeof k.wait>[] = [];
  const scheduleIdle = () => {
    const delay = 8 + Math.random() * 22; // 8-30 s
    const t = k.wait(delay, () => {
      if (reduced) { scheduleIdle(); return; }
      if (!bothIdleGrounded()) { scheduleIdle(); return; }
      const dlg = getDialogue();
      if (!dlg) { scheduleIdle(); return; }
      // 20% chance to reach for behavior tier first (parity with legacy
      // f163e4d: ~20% chance picks 'behavior'). Dialogue.fire('behavior')
      // will fall through to 'idle' if no behavior scene is eligible.
      let fired = false;
      if (Math.random() < 0.20) fired = dlg.fire('behavior');
      if (!fired) dlg.fire('idle');
      scheduleIdle();
    });
    idleTimers.push(t);
  };
  scheduleIdle();

  // ── 2. Inner monologue every 15-40 s, 20% chance ────
  const monoTimers: ReturnType<typeof k.wait>[] = [];
  const scheduleMonologue = () => {
    const delay = 15 + Math.random() * 25; // 15-40 s
    const t = k.wait(delay, () => {
      const dlg = getDialogue();
      if (!dlg || !bothIdleGrounded()) { scheduleMonologue(); return; }
      if (Math.random() < 0.20) {
        const idx = 1 + Math.floor(Math.random() * 15); // bot.monologue.1..15
        const fallback = MONOLOGUE_FALLBACK[idx - 1] ?? '...';
        const text = resolveI18n(`bot.monologue.${idx}`, fallback);
        const who: BotWho = Math.random() < 0.5 ? 'craft' : 'code';
        dlg.quickBubble(who, text, 1500);
      }
      scheduleMonologue();
    });
    monoTimers.push(t);
  };
  scheduleMonologue();

  // ── 3. Thinking sequence every 50-90 s ──────────────
  const thinkTimers: ReturnType<typeof k.wait>[] = [];
  const scheduleThinking = () => {
    const delay = 50 + Math.random() * 40; // 50-90 s
    const t = k.wait(delay, () => {
      const dlg = getDialogue();
      if (!dlg || !bothIdleGrounded()) { scheduleThinking(); return; }
      const who: BotWho = Math.random() < 0.5 ? 'craft' : 'code';
      const bot = who === 'craft' ? craft : code;
      try { bot.play('think'); } catch (_) {}
      // After 1.5 s, fire a 'thinking' scene if one exists; otherwise
      // fall back to 'insight:<who>' (legacy used `insight:<who>` for
      // the bubble). Either way, return to idle when done.
      k.wait(1.5, () => {
        try { if (bot.isGrounded()) bot.play('idle'); } catch (_) {}
        if (dlg.state === 'idle') {
          if (!dlg.fire(`insight:${who}`)) dlg.fire('idle');
        }
      });
      scheduleThinking();
    });
    thinkTimers.push(t);
  };
  scheduleThinking();

  // ── 4. Toss scene every 80-170 s ────────────────────
  const tossTimers: ReturnType<typeof k.wait>[] = [];
  const startToss = (attacker: BotWho, victim: BotWho) => {
    const dlg = getDialogue();
    if (!dlg) return;
    // Pick the scene first so we have an intro to play. Falls back to
    // a generic taunt line if no toss_intro:<who> scene fits cooldowns.
    const scene = dlg.pick(`toss_intro:${attacker}`);
    if (!scene) return;
    const lines = dlg.play(scene);
    dlg.playSequence(lines).then(() => {
      // ── physical toss ──
      const va = handle.bots[attacker] as unknown as BotLikeAI;
      const vv = handle.bots[victim]   as unknown as BotLikeAI;
      if (!va.isGrounded() || !vv.isGrounded()) return;
      // Stand ~34 px to the near side of the victim
      const approachX = vv.pos.x + (va.pos.x < vv.pos.x ? -34 : +34);
      walk.walkTo(attacker, approachX, () => {
        try { va.flipX = vv.pos.x < va.pos.x; va.play('wave'); } catch (_) {}
        k.wait(0.36, () => {
          if (!vv.isGrounded()) return;
          const dir = vv.pos.x > va.pos.x ? 1 : -1;
          try {
            vv.vel.x = dir * (300 + Math.random() * 120);
            vv.vel.y = -650 - Math.random() * 200; // negative = up
            vv.play('tumble');
          } catch (_) {}
          try { va.play('idle'); } catch (_) {}
          // Attacker's gag line
          k.wait(0.2, () => {
            const d = getDialogue();
            if (d && d.state === 'idle') d.fire(`toss_shout:${attacker}`);
          });
          // Victim throw shout (airborne)
          k.wait(0.4, () => {
            const d = getDialogue();
            if (d && d.state === 'idle') d.fire(`throw:${victim}`);
          });
          // Rapport drops on a toss (legacy parity).
          dlg.adjustRapport(-2);
        });
      });
    });
  };
  const scheduleToss = () => {
    const delay = 80 + Math.random() * 90; // 80-170 s
    const t = k.wait(delay, () => {
      if (reduced) { scheduleToss(); return; }
      if (bothIdleGrounded()) {
        const attacker: BotWho = Math.random() < 0.5 ? 'craft' : 'code';
        const victim:   BotWho = attacker === 'craft' ? 'code' : 'craft';
        startToss(attacker, victim);
      }
      scheduleToss();
    });
    tossTimers.push(t);
  };
  scheduleToss();

  // ── 5. Floor button — proximity press ───────────────
  // Spawn a small pad on the floor (~1/3 in from the left). When a
  // bot's feet are within 30 px and grounded, play a press anim and
  // fire the legacy `button_pressed:<who>` scene if one exists.
  const BUTTON_W = 28;
  const BUTTON_H = 8;
  const BUTTON_X = handle.logical.w * 0.62 - BUTTON_W / 2;
  const BUTTON_Y = 408 - BUTTON_H; // FLOOR_TOP_Y from kaplay.engine
  const buttonPad = k.add([
    k.rect(BUTTON_W, BUTTON_H),
    k.pos(BUTTON_X, BUTTON_Y),
    k.color(255, 215, 64),
    k.opacity(0.85),
    'cc-floor-btn',
    { _pressedAt: 0 },
  ]);
  // Outline + soft glow drawn manually via onDraw — KAPLAY's outline()
  // component crashed at runtime ("Cannot read 'x' of undefined") even
  // with area() attached, so we draw the border ourselves.
  k.onDraw(() => {
    if (!buttonPad.exists()) return;
    // glow ring under the pad
    k.drawRect({
      pos: k.vec2(BUTTON_X - 4, BUTTON_Y - 2),
      width: BUTTON_W + 8, height: BUTTON_H + 4,
      color: k.rgb(236, 72, 153),
      opacity: 0.18,
    });
    // accent border around the pad
    k.drawRect({
      pos: k.vec2(BUTTON_X - 1, BUTTON_Y - 1),
      width: BUTTON_W + 2, height: 1,
      color: k.rgb(236, 72, 153),
    });
    k.drawRect({
      pos: k.vec2(BUTTON_X - 1, BUTTON_Y + BUTTON_H),
      width: BUTTON_W + 2, height: 1,
      color: k.rgb(236, 72, 153),
    });
    k.drawRect({
      pos: k.vec2(BUTTON_X - 1, BUTTON_Y),
      width: 1, height: BUTTON_H,
      color: k.rgb(236, 72, 153),
    });
    k.drawRect({
      pos: k.vec2(BUTTON_X + BUTTON_W, BUTTON_Y),
      width: 1, height: BUTTON_H,
      color: k.rgb(236, 72, 153),
    });
  });

  let lastPressAt = 0;
  const tryPress = (who: BotWho) => {
    const now = performance.now();
    if (now - lastPressAt < 6_000) return; // 6 s cooldown
    const dlg = getDialogue();
    if (!dlg || dlg.state !== 'idle') return;
    lastPressAt = now;
    try {
      buttonPad.opacity = 0.4;
      k.wait(0.18, () => { try { buttonPad.opacity = 0.85; } catch (_) {} });
    } catch (_) {}
    // Fire the press scene; falls back to a quick bubble if no scene.
    if (!dlg.fire(`button_pressed:${who}`)) {
      dlg.quickBubble(who, '*click*', 1200);
    }
  };
  // Wire dialogue's button hook so external callers can re-trigger FX.
  const dlgBoot = getDialogue();
  if (dlgBoot) {
    dlgBoot.setFloorButtonHook(() => {
      try {
        buttonPad.opacity = 0.4;
        k.wait(0.18, () => { try { buttonPad.opacity = 0.85; } catch (_) {} });
      } catch (_) {}
    });
  }
  const buttonTick = k.onUpdate(() => {
    const cx = BUTTON_X + BUTTON_W / 2;
    (['craft', 'code'] as BotWho[]).forEach((who) => {
      const bot = (who === 'craft' ? craft : code);
      if (!bot.isGrounded() || bot.isDragging) return;
      // Floor-level test: foot Y within 12 px of pad's Y, and X within 24 px.
      const dy = Math.abs(bot.pos.y - (BUTTON_Y + BUTTON_H));
      const dx = Math.abs(bot.pos.x - cx);
      if (dy < 14 && dx < 22) tryPress(who);
    });
  });

  // ── 6. Bot-on-bot bump tracker ──────────────────────
  // Bumps register when the two bots' x-extent overlap & y-feet differ
  // by less than ~10 px (stacking already handled in engine). Use a
  // 600 ms cooldown so a single press doesn't flood the counter.
  let lastBumpAt = 0;
  const BOT_HALF = 16;
  const bumpTick = k.onUpdate(() => {
    const now = performance.now();
    if (now - lastBumpAt < 600) return;
    const dx = Math.abs(craft.pos.x - code.pos.x);
    const dy = Math.abs(craft.pos.y - code.pos.y);
    if (dx < BOT_HALF * 2 + 4 && dy < 8 &&
        (Math.abs(craft.vel.x) + Math.abs(code.vel.x) > 30)) {
      lastBumpAt = now;
      const dlg = getDialogue();
      if (dlg) {
        dlg.recordBump();
        // Drop rapport slightly per bump.
        if (Math.random() < 0.5) dlg.adjustRapport(-1);
      }
    }
  });

  // ── 7. Drag-react: partner notice ────────────────────
  // Watch for `isDragging` toggles and fire partner_dragged scene once.
  let lastDragSeen: Record<BotWho, boolean> = { craft: false, code: false };
  const dragTick = k.onUpdate(() => {
    const dlg = getDialogue();
    if (!dlg) return;
    (['craft', 'code'] as BotWho[]).forEach((who) => {
      const bot = who === 'craft' ? craft : code;
      const drag = bot.isDragging;
      if (drag && !lastDragSeen[who]) {
        if (dlg.state === 'idle') dlg.fire(`partner_dragged:${who}`);
      }
      lastDragSeen[who] = drag;
    });
  });

  // ── 8. Wake-up dialogue when a bot leaves sleep ──────
  let lastSleeping: Record<BotWho, boolean> = { craft: false, code: false };
  const wakeTick = k.onUpdate(() => {
    const dlg = getDialogue();
    if (!dlg) return;
    (['craft', 'code'] as BotWho[]).forEach((who) => {
      const bot = (who === 'craft' ? craft : code) as BotLikeAI & { _isSleeping?: boolean };
      const sleepNow = !!bot._isSleeping;
      if (lastSleeping[who] && !sleepNow) {
        // Just woke up. Fire 'wake' or fall back to gentle_touch.
        if (dlg.state === 'idle') {
          if (!dlg.fire('wake')) dlg.fire(`gentle_touch:${who}`);
        }
      }
      lastSleeping[who] = sleepNow;
    });
  });

  // ── 9. Konami easter egg ────────────────────────────
  // Listen for the legacy konami buffer (mirrors bot.easter.ts behaviour)
  // — KONAMI keys → dialogue.fire('konami').
  const konamiCode = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  let buf: string[] = [];
  const onKey = (ev: KeyboardEvent) => {
    buf.push(ev.key);
    if (buf.length > konamiCode.length) buf.shift();
    if (buf.length !== konamiCode.length) return;
    let ok = true;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i].toLowerCase() !== konamiCode[i].toLowerCase()) { ok = false; break; }
    }
    if (ok) {
      buf = [];
      const dlg = getDialogue();
      if (dlg && dlg.state === 'idle') {
        try { craft.play('wave'); code.play('wave'); } catch (_) {}
        dlg.fire('konami');
      }
    }
  };
  try { window.addEventListener('keydown', onKey); } catch (_) {}

  return {
    destroy() {
      try { walk.destroy(); } catch (_) {}
      try { onKey && window.removeEventListener('keydown', onKey); } catch (_) {}
      [...idleTimers, ...monoTimers, ...thinkTimers, ...tossTimers].forEach((t) => {
        try { (t as { cancel?: () => void })?.cancel?.(); } catch (_) {}
      });
      try { (buttonTick as { cancel?: () => void })?.cancel?.(); } catch (_) {}
      try { (bumpTick as { cancel?: () => void })?.cancel?.(); } catch (_) {}
      try { (dragTick as { cancel?: () => void })?.cancel?.(); } catch (_) {}
      try { (wakeTick as { cancel?: () => void })?.cancel?.(); } catch (_) {}
      try { buttonPad.destroy(); } catch (_) {}
      const dlg = getDialogue();
      if (dlg) dlg.setFloorButtonHook(null);
    },
  };
}
