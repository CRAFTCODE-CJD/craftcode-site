/* ══════════════════════════════════════════════════════
   CRAFTCODE — KAPLAY playground engine (migration WIP)
   ══════════════════════════════════════════════════════
   Scaffold for the migration described in DESIGN-BRIEF.md:
   replace the 2 887-line engine.legacy.js with a KAPLAY-
   backed runtime. This module is OPT-IN — loaded only by
   <KaplayPlayground /> when mounted. The legacy engine
   stays the default until this surface reaches feature
   parity (drag/throw, bubbles bridged to i18n, events,
   camera, terminal integration).

   Current etape coverage:
     · §1  skeleton (canvas + gravity + background)      ✓
     · §2  actors + sprite animations                    ✓
     · §3  platforms (step_01, floating_02, crate_03)    ✓
     · §4  AI wander (random dir + edge jump + wrap)     ✓
     · §5  drag & throw                                  ✓
     · §7  dust FX on landing                            ✓
     · §9  camera follow (clamp scale)                   ✓
     · §6  bubble bridge                                 partial — text-only API exposed
     · §8  random events                                 TODO
     · §10 index.astro integration                       opt-in via <KaplayPlayground />
     · §11 legacy cleanup                                DEFERRED
                                                              */

import kaplay from 'kaplay';
import type { KAPLAYCtx, GameObj } from 'kaplay';

export type BotWho = 'craft' | 'code';

export interface KaplayHandle {
  destroy(): void;
  showBubble(who: BotWho, text: string, holdMs?: number): void;
  hideBubbles(): void;
  pause(): void;
  resume(): void;
}

// Base logical resolution. Canvas DOM size scales via CSS; KAPLAY keeps
// drawing at this fixed internal resolution for crisp pixel output.
const LOGICAL_W = 1200;
const LOGICAL_H = 420;

// Sprite sheet layout — matches public/sprites/craft.png / code.png.
// 92 frames, single row (see frames.data.js FRAME_ORDER).
const SHEET_FRAMES = 92;

// Named animations — maps directly onto FRAME_ORDER indices.
// Kept minimal for the MVP; extra clips can be ported from CLIPS later.
const ANIMS = {
  idle:    { from: 0,  to: 1,  loop: true, speed: 2 },
  walk:    { from: 5,  to: 10, loop: true, speed: 11 },
  jump:    { from: 13, to: 15, loop: false, speed: 10 },
  land:    { from: 15, to: 16, loop: false, speed: 8 },
  tumble:  { from: 17, to: 20, loop: true, speed: 14 },
  wave:    { from: 43, to: 44, loop: true, speed: 5 },
  typing:  { from: 46, to: 47, loop: true, speed: 10 },
  excited: { from: 45, to: 45, loop: true, speed: 1 },
  think:   { from: 62, to: 63, loop: true, speed: 9 },
  sleep:   { from: 89, to: 91, loop: true, speed: 1.3 },
};

interface InitOpts {
  canvas: HTMLCanvasElement;
  bubbleHost: HTMLElement;
  reducedMotion?: boolean;
}

export function initKaplayPlayground(opts: InitOpts): KaplayHandle {
  const { canvas, bubbleHost } = opts;
  const reducedMotion = !!opts.reducedMotion;

  // ── KAPLAY context ────────────────────────────────────
  const k: KAPLAYCtx = kaplay({
    canvas,
    width: LOGICAL_W,
    height: LOGICAL_H,
    crisp: true,
    debug: false,
    background: [10, 10, 15, 0], // transparent — CSS background shows through
    global: false,
    touchToMouse: true,
    // Kill KAPLAY's built-in debug keys so "/" terminal hotkey works.
    burp: false,
  });

  k.setGravity(1450);

  // ── Sprites ───────────────────────────────────────────
  k.loadSprite('craft', '/sprites/craft.png', {
    sliceX: SHEET_FRAMES,
    sliceY: 1,
    anims: ANIMS,
  });
  k.loadSprite('code', '/sprites/code.png', {
    sliceX: SHEET_FRAMES,
    sliceY: 1,
    anims: ANIMS,
  });

  // ── Floor ─────────────────────────────────────────────
  k.add([
    k.rect(LOGICAL_W, 12),
    k.pos(0, LOGICAL_H - 12),
    k.area(),
    k.body({ isStatic: true }),
    k.color(236, 72, 153),
    k.opacity(0.9),
    'platform',
    'floor',
  ]);

  // ── Static platforms — positions from BootToPlayground.astro ──
  // Original CSS used percentage/right-anchored positions against a 1200×420
  // stage; translate those to absolute pixel coordinates here.
  const step_01 = {
    x: LOGICAL_W * 0.08,
    y: 360,
    w: 130,
    h: 28,
    label: 'step_01',
  };
  const floating_02 = {
    x: LOGICAL_W * 0.38,
    y: 290,
    w: 150,
    h: 14,
    label: 'floating_02',
  };
  const crate_03 = {
    x: LOGICAL_W - LOGICAL_W * 0.09 - 150,
    y: 230,
    w: 150,
    h: 22,
    label: 'crate_03',
  };
  [step_01, floating_02, crate_03].forEach((p) => {
    k.add([
      k.rect(p.w, p.h),
      k.pos(p.x, p.y),
      k.area(),
      k.body({ isStatic: true }),
      k.color(255, 207, 63),
      k.opacity(0.7),
      k.outline(1, k.rgb(255, 207, 63)),
      'platform',
      { label: p.label },
    ]);
  });

  // ── Bots ──────────────────────────────────────────────
  type BotObj = GameObj;
  const makeBot = (who: BotWho, x: number): BotObj => {
    const bot = k.add([
      k.sprite(who, { anim: 'idle' }),
      k.pos(x, 200),
      k.area({ shape: new k.Rect(k.vec2(0), 32, 40) }),
      k.body({ jumpForce: 520 }),
      k.anchor('bot'),
      'bot',
      {
        who,
        wanderDir: 0 as -1 | 0 | 1,
        nextWanderAt: 0,
        isDragging: false,
        lastMouse: k.vec2(0, 0),
        throwVel: k.vec2(0, 0),
      },
    ]);
    return bot;
  };

  const craft = makeBot('craft', 240) as BotObj & {
    who: BotWho;
    wanderDir: -1 | 0 | 1;
    nextWanderAt: number;
    isDragging: boolean;
    lastMouse: ReturnType<typeof k.vec2>;
    throwVel: ReturnType<typeof k.vec2>;
  };
  const code = makeBot('code', 360) as typeof craft;
  const bots = [craft, code];

  // ── Landing FX + anim bridge ──────────────────────────
  const spawnDust = (x: number, y: number) => {
    if (reducedMotion) return;
    for (let i = 0; i < 4; i++) {
      k.add([
        k.rect(4 + Math.random() * 4, 3),
        k.pos(x + (Math.random() - 0.5) * 20, y),
        k.anchor('center'),
        k.color(236, 72, 153),
        k.opacity(0.8),
        k.lifespan(0.4, { fade: 0.3 }),
        k.move(k.vec2((Math.random() - 0.5) * 40, -30 - Math.random() * 20), 60),
      ]);
    }
  };

  bots.forEach((bot) => {
    bot.onGround(() => {
      try { bot.play('land'); } catch (_) {}
      spawnDust(bot.pos.x, bot.pos.y);
      setTimeout(() => {
        if (!bot.isDragging && bot.isGrounded()) {
          try { bot.play(bot.wanderDir !== 0 ? 'walk' : 'idle'); } catch (_) {}
        }
      }, 180);
    });
    bot.onHeadbutt(() => {
      // Cap upward velocity so they don't stick under platforms.
      if (bot.vel.y < 0) bot.vel.y = 0;
    });
  });

  // ── §4 Wander AI ──────────────────────────────────────
  const WANDER_MIN_MS = 3000;
  const WANDER_MAX_MS = 7000;
  const WANDER_SPEED = 60;

  const scheduleWander = (bot: typeof craft) => {
    const delay = WANDER_MIN_MS + Math.random() * (WANDER_MAX_MS - WANDER_MIN_MS);
    bot.nextWanderAt = k.time() * 1000 + delay;
  };
  bots.forEach(scheduleWander);

  k.onUpdate(() => {
    if (reducedMotion) return;
    const now = k.time() * 1000;
    for (const bot of bots) {
      if (bot.isDragging) continue;
      if (!bot.isGrounded()) continue;

      if (now >= bot.nextWanderAt) {
        // Re-roll direction: -1, 0, +1.
        const r = Math.random();
        bot.wanderDir = r < 0.33 ? -1 : r < 0.66 ? 0 : 1;
        scheduleWander(bot);
        // Occasional jump.
        if (Math.random() < 0.3) {
          try { bot.jump(520); } catch (_) {}
        }
        if (bot.wanderDir === 0) {
          try { bot.play('idle'); } catch (_) {}
        } else {
          try { bot.play('walk'); } catch (_) {}
          bot.flipX = bot.wanderDir < 0;
        }
      }

      if (bot.wanderDir !== 0) {
        bot.move(bot.wanderDir * WANDER_SPEED, 0);
      }

      // Screen wrap.
      if (bot.pos.x < -20) bot.pos.x = LOGICAL_W + 10;
      else if (bot.pos.x > LOGICAL_W + 20) bot.pos.x = -10;
    }
  });

  // ── §5 Drag & throw ───────────────────────────────────
  let dragged: typeof craft | null = null;
  const dragHistory: { x: number; y: number; t: number }[] = [];

  k.onMousePress(() => {
    const m = k.mousePos();
    for (const bot of bots) {
      if (bot.hasPoint?.(m)) {
        dragged = bot;
        bot.isDragging = true;
        bot.gravityScale = 0;
        bot.vel.x = 0;
        bot.vel.y = 0;
        dragHistory.length = 0;
        try { bot.play('wave'); } catch (_) {}
        break;
      }
    }
  });

  k.onMouseMove(() => {
    if (!dragged) return;
    const m = k.mousePos();
    dragged.pos.x = m.x;
    dragged.pos.y = m.y;
    const now = k.time() * 1000;
    dragHistory.push({ x: m.x, y: m.y, t: now });
    while (dragHistory.length > 0 && now - dragHistory[0].t > 120) {
      dragHistory.shift();
    }
  });

  k.onMouseRelease(() => {
    if (!dragged) return;
    const bot = dragged;
    bot.isDragging = false;
    bot.gravityScale = 1;
    // Impulse from last ~120ms of motion.
    if (dragHistory.length >= 2) {
      const first = dragHistory[0];
      const last = dragHistory[dragHistory.length - 1];
      const dt = Math.max(16, last.t - first.t);
      const vx = ((last.x - first.x) / dt) * 1000;
      const vy = ((last.y - first.y) / dt) * 1000;
      bot.vel.x = Math.max(-800, Math.min(800, vx));
      bot.vel.y = Math.max(-800, Math.min(800, vy));
    }
    try { bot.play('tumble'); } catch (_) {}
    dragged = null;
  });

  // ── §9 Camera follow ──────────────────────────────────
  k.onUpdate(() => {
    if (bots.length < 2) return;
    const cx = (craft.pos.x + code.pos.x) / 2;
    const cy = (craft.pos.y + code.pos.y) / 2;
    // Smooth lerp.
    const cur = k.getCamPos();
    const nx = k.lerp(cur.x, cx, 0.06);
    const ny = k.lerp(cur.y, cy * 0.6 + LOGICAL_H * 0.5 * 0.4, 0.06);
    k.setCamPos(nx, ny);

    const dist = craft.pos.dist(code.pos);
    const targetScale = Math.max(0.85, Math.min(1.15, 220 / Math.max(120, dist)));
    const curScale = k.getCamScale().x;
    k.setCamScale(k.lerp(curScale, targetScale, 0.04));
  });

  // ── §6 Bubble bridge (DOM overlay above canvas) ───────
  const bubbles: Record<BotWho, HTMLElement | null> = { craft: null, code: null };
  const bubbleTimers: Record<BotWho, number | null> = { craft: null, code: null };

  const ensureBubble = (who: BotWho): HTMLElement => {
    let el = bubbles[who];
    if (el && el.isConnected) return el;
    el = document.createElement('div');
    el.className = `kc-bubble kc-bubble--${who}`;
    el.setAttribute('data-who', who);
    bubbleHost.appendChild(el);
    bubbles[who] = el;
    return el;
  };

  const positionBubble = (who: BotWho) => {
    const el = bubbles[who];
    if (!el) return;
    const bot = who === 'craft' ? craft : code;
    // Project world pos → canvas px → DOM px.
    const camPos = k.getCamPos();
    const scale = k.getCamScale().x;
    const projX = (bot.pos.x - camPos.x) * scale + LOGICAL_W / 2;
    const projY = (bot.pos.y - camPos.y) * scale + LOGICAL_H / 2;
    const rect = canvas.getBoundingClientRect();
    const kx = rect.width / LOGICAL_W;
    const ky = rect.height / LOGICAL_H;
    const px = projX * kx;
    const py = (projY - 60) * ky; // 60px above bot's head
    el.style.transform = `translate(${px}px, ${py}px) translate(-50%, -100%)`;
  };

  k.onUpdate(() => {
    if (bubbles.craft?.classList.contains('visible')) positionBubble('craft');
    if (bubbles.code?.classList.contains('visible')) positionBubble('code');
  });

  const showBubble = (who: BotWho, text: string, holdMs = 2400) => {
    const el = ensureBubble(who);
    el.textContent = `${who}: ${text}`;
    el.classList.add('visible');
    positionBubble(who);
    if (bubbleTimers[who]) clearTimeout(bubbleTimers[who]!);
    bubbleTimers[who] = window.setTimeout(() => {
      el.classList.remove('visible');
    }, holdMs);
  };

  const hideBubbles = () => {
    (['craft', 'code'] as BotWho[]).forEach((who) => {
      bubbles[who]?.classList.remove('visible');
      if (bubbleTimers[who]) { clearTimeout(bubbleTimers[who]!); bubbleTimers[who] = null; }
    });
  };

  // ── Handle / external API ────────────────────────────
  let paused = false;
  const handle: KaplayHandle = {
    destroy() {
      try { k.quit(); } catch (_) {}
      (['craft', 'code'] as BotWho[]).forEach((who) => {
        bubbles[who]?.remove();
        bubbles[who] = null;
      });
    },
    showBubble,
    hideBubbles,
    pause() {
      if (paused) return;
      paused = true;
      try { k.setGravity(0); } catch (_) {}
    },
    resume() {
      if (!paused) return;
      paused = false;
      try { k.setGravity(1450); } catch (_) {}
    },
  };

  // Expose for ad-hoc debugging (parallel to window.__companions).
  if (typeof window !== 'undefined') {
    (window as unknown as { __kaplayBots?: KaplayHandle }).__kaplayBots = handle;
  }

  return handle;
}
