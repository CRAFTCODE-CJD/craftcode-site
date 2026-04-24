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

export type KaplayBotsMap = Record<BotWho, GameObj>;

export interface KaplayHandle {
  destroy(): void;
  showBubble(who: BotWho, text: string, holdMs?: number): void;
  hideBubbles(): void;
  pause(): void;
  resume(): void;
  /** KAPLAY context — exposed so companion modules (events, etc.) can add objects. */
  k: KAPLAYCtx;
  /** Live references to the two bot GameObjs. Consumers use `bot.play(clip)`
   *  for animation changes and `bot.pos`/`bot.isGrounded()` for queries. */
  bots: KaplayBotsMap;
  /** Logical stage size (KAPLAY world units). */
  logical: { w: number; h: number };
}

// Base logical resolution. Canvas DOM size scales via CSS; KAPLAY keeps
// drawing at this fixed internal resolution for crisp pixel output.
const LOGICAL_W = 1200;
const LOGICAL_H = 480;
// Y of the walkable ground line. Bots stand with their feet at this
// Y; the floor physics body tops out here. Visual hatch extends from
// FLOOR_TOP_Y all the way down to LOGICAL_H so there's no dead band
// beneath the bots.
const FLOOR_TOP_Y = 408;

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
    // stretch=true + letterbox=true → KAPLAY sizes the canvas to the
    // parent via CSS instead of pinning 1200×480 inline. Internal
    // drawing stays at the logical resolution; the element just scales
    // down on mobile while preserving the 1200:480 aspect.
    stretch: true,
    letterbox: true,
    crisp: true,
    debug: false,
    background: [0, 0, 0, 0], // transparent — DOM overlay provides visuals
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

  // ── Pre-rendered hatch tiles ──────────────────────────
  // Build once per init using an offscreen Canvas2D, then load into
  // KAPLAY as sprites that can be tiled across platform rects.
  // Three variants:
  //   hatch-plat  — dark purple base + pink hatch (static platforms)
  //   hatch-event — same base, stronger pink tint (event-spawned)
  //   hatch-floor — even darker base + subtle pink hatch (floor)
  const makeHatchTile = (
    size: number,
    baseColor: string,
    strokeColor: string,
    stride: number,
    lineWidth: number,
  ): string => {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'square';
    ctx.beginPath();
    // Diagonal stripes — draw well beyond the tile so the pattern is
    // seamless when it wraps. Angle is 45° because dx==dy==size.
    for (let i = -size; i < size * 2; i += stride) {
      ctx.moveTo(i, 0);
      ctx.lineTo(i + size, size);
    }
    ctx.stroke();
    return c.toDataURL();
  };

  // Non-blocking loadSprite — KAPLAY queues the asset internally.
  try {
    k.loadSprite('hatch-plat',  makeHatchTile(32, 'rgb(38,22,38)', 'rgba(236,72,153,0.35)', 8, 2));
    k.loadSprite('hatch-event', makeHatchTile(32, 'rgb(38,22,38)', 'rgba(236,72,153,0.55)', 8, 2));
    k.loadSprite('hatch-floor', makeHatchTile(24, 'rgb(28,18,28)', 'rgba(236,72,153,0.22)', 12, 2));
  } catch (_) { /* SSR / no-DOM safeguard */ }

  // ── Floor ─────────────────────────────────────────────
  // Physics body spans 3× logical width so the horizontal screen-wrap
  // never drops a bot into void. The visible tile, however, is drawn
  // only across [0..LOGICAL_W] by a dedicated visual GameObj; the
  // extended physics body uses opacity(0).
  // Physics body sits at FLOOR_TOP_Y with a thin 12-px collision box.
  // That's still where feet touch.
  k.add([
    k.rect(LOGICAL_W * 3, 12),
    k.pos(-LOGICAL_W, FLOOR_TOP_Y),
    k.area(),
    k.body({ isStatic: true }),
    k.opacity(0),
    'platform',
    'floor',
  ]);
  // Visual-only floor tile — extends from FLOOR_TOP_Y all the way down
  // to the canvas bottom so the whole region beneath the bots reads as
  // continuous ground. 3× width keeps the hatch covering the wrap zone.
  const FLOOR_VIS_H = LOGICAL_H - FLOOR_TOP_Y; // fills to canvas bottom
  k.add([
    k.sprite('hatch-floor', { tiled: true, width: LOGICAL_W * 3, height: FLOOR_VIS_H }),
    k.pos(-LOGICAL_W, FLOOR_TOP_Y),
    'floor-visual',
    { _kind: 'floor' as const },
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
    // Tiled hatch sprite renders the fill; a shared onDraw below paints
    // the neon top edge, corner ticks, and label above each box.
    k.add([
      k.sprite('hatch-plat', { tiled: true, width: p.w, height: p.h }),
      k.pos(p.x, p.y),
      k.area({ shape: new k.Rect(k.vec2(0), p.w, p.h) }),
      k.body({ isStatic: true }),
      'platform',
      { label: p.label, _label: `// ${p.label}`, _size: { w: p.w, h: p.h } },
    ]);
  });

  // ── Neon edges + ticks + labels (shared onDraw) ──────
  // Runs in camera-world space, so visuals stay pinned to physics at
  // any zoom / pan. Colors mirror the old DOM decor CSS.
  const ACCENT  = k.rgb(236, 72, 153);   // pink
  const ACCENT2 = k.rgb(234, 179, 8);    // yellow
  const LABEL   = k.rgb(148, 130, 144);

  k.onDraw(() => {
    // Floor neon top edge — drawn directly at FLOOR_TOP_Y minus 2 px so
    // the lit line mirrors the legacy DOM ::after. Spans the same
    // extended (3×) range as the physics body / visual tile so zoomed-
    // out frames never reveal a hard cutoff.
    k.drawRect({
      pos: k.vec2(-LOGICAL_W, FLOOR_TOP_Y - 2),
      width: LOGICAL_W * 3,
      height: 2,
      color: ACCENT,
    });
    k.drawRect({
      pos: k.vec2(-LOGICAL_W, FLOOR_TOP_Y - 6),
      width: LOGICAL_W * 3,
      height: 4,
      color: ACCENT,
      opacity: 0.35,
    });

    // Platforms (including event-spawned) — tag 'platform'. The floor
    // physics body shares the tag but carries 'floor'; skip it.
    const platforms = k.get('platform');
    for (const p of platforms) {
      if (p.is('floor')) continue;
      const size = (p as unknown as { _size?: { w: number; h: number } })._size;
      const w = size?.w ?? 0;
      const h = size?.h ?? 0;
      if (!w || !h) continue;

      const isEvent = p.is('event-platform');
      const edgeColor = isEvent ? ACCENT : ACCENT2;
      const tickColor = ACCENT2;

      // Neon top edge — 2px tall, glow 4px tall at 35%.
      k.drawRect({
        pos: k.vec2(p.pos.x, p.pos.y - 2),
        width: w, height: 2, color: edgeColor,
      });
      k.drawRect({
        pos: k.vec2(p.pos.x, p.pos.y - 6),
        width: w, height: 4, color: edgeColor, opacity: 0.35,
      });

      // Corner ticks.
      k.drawRect({ pos: k.vec2(p.pos.x,           p.pos.y - 4), width: 4, height: 4, color: tickColor });
      k.drawRect({ pos: k.vec2(p.pos.x + w - 4,   p.pos.y - 4), width: 4, height: 4, color: tickColor });

      // Label (skip if none, e.g. event platforms omit labels).
      const label = (p as unknown as { _label?: string })._label;
      if (label) {
        k.drawText({
          text: label,
          pos: k.vec2(p.pos.x + 6, p.pos.y - 18),
          size: 10,
          color: LABEL,
          font: 'monospace',
        });
      }
    }
  });

  // ── Bots ──────────────────────────────────────────────
  type BotObj = GameObj;
  const makeBot = (who: BotWho, x: number): BotObj => {
    const bot = k.add([
      k.sprite(who, { anim: 'idle' }),
      k.pos(x, 200),
      k.area({ shape: new k.Rect(k.vec2(0), 32, 40) }),
      // Industry-standard platformer body: terminal fall velocity, mild
      // air drag, mass=1, and stickToPlatform so bots ride moving
      // platforms (event obstacle_move) without slipping off.
      k.body({
        jumpForce: 520,
        maxVelocity: 900,
        drag: 0.01,
        mass: 1,
        stickToPlatform: true,
      }),
      k.anchor('bot'),
      'bot',
      {
        who,
        wanderDir: 0 as -1 | 0 | 1,
        nextWanderAt: 0,
        isDragging: false,
        lastMouse: k.vec2(0, 0),
        throwVel: k.vec2(0, 0),
        // Coyote time (ms timestamp until which bot can still jump after
        // walking off an edge). 120ms grace.
        _groundedUntil: 0,
        // Last time the bot was snapped onto another bot's head.
        _groundedOnBot: 0,
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
    _groundedUntil: number;
    _groundedOnBot: number;
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
      // Squash & stretch on landing — quick visual punch that reads as
      // weight without altering hit-area or physics. Skipped under
      // reduced motion for accessibility.
      if (!reducedMotion) {
        try {
          bot.use(k.scale(1.15, 0.85));
          k.wait(0.12, () => {
            if (bot.exists()) {
              try { bot.scale = k.vec2(1, 1); } catch (_) {}
            }
          });
        } catch (_) { /* graceful — scale comp may already be present */ }
      }
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

  // ── Per-frame: coyote timer, ground friction, gravity asymmetry ──
  // Celeste-style asymmetric gravity (lighter on the rise, heavier on
  // the fall) gives jumps a snappier, more controllable feel. We only
  // touch gravityScale when not being dragged — drag sets it to 0.
  k.onUpdate(() => {
    const nowMs = performance.now();
    for (const bot of bots) {
      if (bot.isDragging) continue;

      // Coyote: refresh grace window while grounded.
      if (bot.isGrounded()) {
        bot._groundedUntil = nowMs + 120;
      }

      // Asymmetric gravity — only when airborne and not held.
      if (!bot.isGrounded()) {
        bot.gravityScale = bot.vel.y < 0 ? 0.85 : 1.15;
      } else {
        bot.gravityScale = 1;
      }

      // Ground friction when wandering is idle — bleed off horizontal
      // velocity so a thrown bot eventually settles instead of sliding.
      if (bot.wanderDir === 0 && bot.isGrounded()) {
        bot.vel.x *= 0.85;
        if (Math.abs(bot.vel.x) < 5) bot.vel.x = 0;
      }
    }
  });

  // ── Bot-on-bot stacking snap ─────────────────────────
  // KAPLAY's dynamic-on-dynamic resolution leaves a visible gap when one
  // bot is dropped onto another's head; manually snap the upper bot's
  // feet to the lower bot's hit-area top when they horizontally overlap
  // and the upper is descending or near-rest above the lower.
  k.onUpdate(() => {
    const pairs = [[craft, code], [code, craft]] as const;
    for (const [upper, lower] of pairs) {
      if (upper.isDragging || lower.isDragging) continue;
      const uA = upper.worldArea();
      const lA = lower.worldArea();
      if (!uA || !lA || !uA.pts || !lA.pts) continue;
      // Rect.pts → [TL, TR, BR, BL] in KAPLAY.
      const uLeft   = Math.min(uA.pts[0].x, uA.pts[3].x);
      const uRight  = Math.max(uA.pts[1].x, uA.pts[2].x);
      const uBottom = Math.max(uA.pts[2].y, uA.pts[3].y);
      const lLeft   = Math.min(lA.pts[0].x, lA.pts[3].x);
      const lRight  = Math.max(lA.pts[1].x, lA.pts[2].x);
      const lTop    = Math.min(lA.pts[0].y, lA.pts[1].y);
      const hOverlap = !(uRight < lLeft || uLeft > lRight);
      if (!hOverlap) continue;
      const gap = lTop - uBottom; // positive = upper above lower
      if (gap > -8 && gap < 4 && upper.vel.y >= -20) {
        // anchor='bot' → pos.y == feet/bottom of hit-area, so snapping
        // pos.y onto the lower bot's hit-area top closes the gap exactly.
        upper.pos.y = lTop;
        upper.vel.y = 0;
        upper._groundedOnBot = performance.now();
      }
    }
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
  // Direct DOM pointer listeners on the canvas — k.onMousePress proved
  // unreliable under certain touch/pointer event fallbacks, and going
  // straight to the canvas element gives us a single, predictable
  // coordinate pipeline: screen → canvas-internal (1200×420) → world
  // (undo the camera transform). Works for mouse + touch uniformly.
  let dragged: typeof craft | null = null;
  const dragHistory: { x: number; y: number; t: number }[] = [];
  let activePointerId: number | null = null;

  const toWorld = (ev: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    // Canvas is rendered at CSS size rect.width × rect.height, internal
    // resolution LOGICAL_W × LOGICAL_H. Scale the event coord first.
    const ix = ((ev.clientX - rect.left) / rect.width) * LOGICAL_W;
    const iy = ((ev.clientY - rect.top) / rect.height) * LOGICAL_H;
    // Then invert camera transform (translate + uniform scale).
    const cam = k.getCamPos();
    const s = k.getCamScale().x || 1;
    return {
      x: (ix - LOGICAL_W / 2) / s + cam.x,
      y: (iy - LOGICAL_H / 2) / s + cam.y,
    };
  };

  const pickBotAt = (wx: number, wy: number) => {
    // Generous hit area — bot sprite is 48×48 rendered but the collision
    // shape is 32×40. For drag we want a comfortable grab box, not the
    // exact collision rect, so use a 56-px square centred on bot.pos
    // (anchor='bot' → pos is feet).
    for (const bot of bots) {
      const dx = wx - bot.pos.x;
      const dy = wy - (bot.pos.y - 24); // centre above feet
      if (Math.abs(dx) < 28 && Math.abs(dy) < 28) return bot;
    }
    return null;
  };

  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button !== undefined && ev.button !== 0) return;
    const { x, y } = toWorld(ev);
    const bot = pickBotAt(x, y);
    if (!bot) return;
    ev.preventDefault();
    try { canvas.setPointerCapture(ev.pointerId); } catch (_) {}
    activePointerId = ev.pointerId;
    dragged = bot;
    bot.isDragging = true;
    bot.gravityScale = 0;
    bot.vel.x = 0;
    bot.vel.y = 0;
    dragHistory.length = 0;
    dragHistory.push({ x, y, t: performance.now() });
    try { bot.play('wave'); } catch (_) {}
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (!dragged || ev.pointerId !== activePointerId) return;
    const { x, y } = toWorld(ev);
    dragged.pos.x = x;
    dragged.pos.y = y;
    const now = performance.now();
    dragHistory.push({ x, y, t: now });
    while (dragHistory.length > 0 && now - dragHistory[0].t > 120) {
      dragHistory.shift();
    }
  });

  const endDrag = (ev: PointerEvent) => {
    if (!dragged || ev.pointerId !== activePointerId) return;
    const bot = dragged;
    try { canvas.releasePointerCapture(ev.pointerId); } catch (_) {}
    activePointerId = null;
    bot.isDragging = false;
    bot.gravityScale = 1;
    if (dragHistory.length >= 2) {
      const first = dragHistory[0];
      const last = dragHistory[dragHistory.length - 1];
      const dt = Math.max(16, last.t - first.t);
      const vx = ((last.x - first.x) / dt) * 1000;
      const vy = ((last.y - first.y) / dt) * 1000;
      bot.vel.x = Math.max(-900, Math.min(900, vx));
      bot.vel.y = Math.max(-900, Math.min(900, vy));
    }
    try { bot.play('tumble'); } catch (_) {}
    dragged = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // ── §9 Camera follow + distance zoom ──────────────────
  // Now that platforms & floor render in-canvas (tiled sprites +
  // shared onDraw overlay), the view can translate/scale freely —
  // bots and their scenery transform together.
  k.setCamPos(LOGICAL_W / 2, LOGICAL_H / 2);
  k.setCamScale(1);
  k.onUpdate(() => {
    if (reducedMotion) return;
    if (bots.length < 2) return;
    const cx = (craft.pos.x + code.pos.x) / 2;
    const cy = (craft.pos.y + code.pos.y) / 2;

    // Discrete, tile-safe zoom. Only integer × tile (24) and × sprite
    // (48) ratios render without shimmer, so we switch the scale in
    // steps instead of lerping through fractional values.
    //   < 180 px apart → 2.0×   (bots close, read big)
    //   < 360 px apart → 1.75×  (middle)
    //   otherwise      → 1.5×   (distant, more of the stage visible)
    // 20-px hysteresis band around each threshold keeps the scale
    // from flipping when bots pace right on the boundary.
    const dist = craft.pos.dist(code.pos);
    const curS = k.getCamScale().x;
    const wasClose = curS >= 1.95;
    const wasMid = curS >= 1.7 && curS < 1.95;
    let nextScale: number;
    if (wasClose)      nextScale = dist > 200 ? 1.75 : 2.0;
    else if (wasMid)   nextScale = dist < 160 ? 2.0 : (dist > 380 ? 1.5 : 1.75);
    else               nextScale = dist < 340 ? 1.75 : 1.5;
    k.setCamScale(nextScale);

    // Visible extents at the upcoming scale (in world units). When the
    // viewport is wider than the world (scale<1, common during zoom-out),
    // a naive halfW clamp inverts (minCx > maxCx) and dragged the camera
    // to the wrong edge. Instead lock to centre when visible >= world,
    // clamp normally otherwise.
    const visW = LOGICAL_W / nextScale;
    const visH = LOGICAL_H / nextScale;

    const rawX = k.lerp(k.getCamPos().x, cx, 0.06);
    const rawY = k.lerp(k.getCamPos().y, cy * 0.5 + LOGICAL_H * 0.5, 0.06);

    const cxT = visW >= LOGICAL_W
      ? LOGICAL_W / 2
      : Math.max(visW / 2, Math.min(LOGICAL_W - visW / 2, rawX));
    const cyT = visH >= LOGICAL_H
      ? LOGICAL_H / 2
      : Math.max(visH / 2, Math.min(LOGICAL_H - visH / 2, rawY));
    // Snap to whole pixels — sub-pixel camera translates cause visible
    // seams in tiled sprites (floor hatch showed a vertical shimmer at
    // tile boundaries). Integer pos + stable scale = clean render.
    k.setCamPos(Math.round(cxT), Math.round(cyT));
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
    // DOM-build the "WHO:" label + body so CSS can style them
    // separately. textContent-based, no innerHTML → no XSS surface.
    el.replaceChildren();
    const kicker = document.createElement('span');
    kicker.className = 'who';
    kicker.textContent = `${who}:`;
    el.appendChild(kicker);
    el.appendChild(document.createTextNode(text));
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
    k,
    bots: { craft, code },
    logical: { w: LOGICAL_W, h: LOGICAL_H },
  };

  // Expose for ad-hoc debugging (parallel to window.__companions).
  if (typeof window !== 'undefined') {
    (window as unknown as { __kaplayBots?: KaplayHandle }).__kaplayBots = handle;
  }

  // Kick off random events (item spawns, moving platforms, new platforms).
  // Imported lazily so SSR-free tree-shaking still works; the module is a
  // side-effect-free default export that we call with the handle.
  try {
    // Dynamic import keeps the events module separate in the bundle and
    // won't block engine init if the file fails to resolve.
    import('./kaplay.events').then((m) => {
      try { m.initKaplayEvents(handle, { reducedMotion }); } catch (_) { /* graceful */ }
    }).catch(() => { /* graceful */ });
  } catch (_) { /* graceful */ }

  return handle;
}
