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
  /** Lazily render (if needed) a full-size event-platform hatch
   *  sprite for the given dimensions and return its sprite name. */
  ensureEventHatchSprite(w: number, h: number): string;
  /** Force a specific clip on a bot for `durationMs`. While the
   *  forced window is active, the animation arbiter will not
   *  override with motion-based clips. Used by dialogue-bridge
   *  (line.clip), behavior-actions, and tasks for priority anims
   *  like typing/think/hammer/wave/excited/sleep. */
  forceClip(who: BotWho, clip: string, durationMs: number): void;
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

  // ── Pre-rendered hatch textures ───────────────────────
  // Build FULL-SIZE rasters at init instead of tileable 24-px tiles.
  // Single-image sprites have no internal tile boundaries, so any
  // camera scale (fractional included) renders cleanly — no seam
  // shimmer even when we interpolate through scale values.
  const makeHatchFull = (
    w: number, h: number,
    baseColor: string,
    strokeColor: string,
    stride: number,
    lineWidth: number,
  ): string => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'square';
    ctx.beginPath();
    // One long diagonal-stripe pass across the entire rect. 45° so
    // dx == dy. Start well before 0 and end well past w so the stripes
    // reach the corners.
    const len = w + h;
    for (let i = -h; i < len; i += stride) {
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
    }
    ctx.stroke();
    return c.toDataURL();
  };

  // Full-width floor raster (3× stage width × floor band height).
  const FLOOR_VIS_H = LOGICAL_H - FLOOR_TOP_Y;
  // Small-platform rasters — separate per declared size so each sprite
  // is pixel-exact for its platform (no tiling → no seam at any zoom).
  const PLAT_SPECS = [
    { label: 'step_01',     w: 130, h: 28 },
    { label: 'floating_02', w: 150, h: 14 },
    { label: 'crate_03',    w: 150, h: 22 },
  ];
  try {
    k.loadSprite(
      'hatch-floor',
      makeHatchFull(LOGICAL_W * 3, FLOOR_VIS_H, 'rgb(28,18,28)', 'rgba(236,72,153,0.22)', 12, 2),
    );
    for (const p of PLAT_SPECS) {
      k.loadSprite(
        `hatch-plat-${p.label}`,
        makeHatchFull(p.w, p.h, 'rgb(38,22,38)', 'rgba(236,72,153,0.35)', 8, 2),
      );
    }
  } catch (_) { /* SSR / no-DOM safeguard */ }

  // Dynamic (event-spawned) platforms get their sprite generated lazily
  // the first time a given w×h combo appears. Cache so re-spawns reuse.
  const eventHatchCache = new Map<string, string>();
  const ensureEventHatch = (w: number, h: number): string => {
    const key = `hatch-event-${w}x${h}`;
    if (!eventHatchCache.has(key)) {
      try {
        k.loadSprite(key, makeHatchFull(w, h, 'rgb(38,22,38)', 'rgba(236,72,153,0.55)', 8, 2));
        eventHatchCache.set(key, key);
      } catch (_) { /* no-DOM */ }
    }
    return key;
  };

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
  // Visual-only floor — one full-width sprite spanning the same 3×
  // range as the physics body. Single raster = no tile boundaries,
  // so any camera scale renders without a seam.
  k.add([
    k.sprite('hatch-floor'),
    k.pos(-LOGICAL_W, FLOOR_TOP_Y),
    'floor-visual',
    { _kind: 'floor' as const },
  ]);

  // ── Static platforms — positions from BootToPlayground.astro ──
  // Original CSS used percentage/right-anchored positions against a 1200×420
  // stage; translate those to absolute pixel coordinates here.
  const step_01 = {
    x: LOGICAL_W * 0.08,
    y: 320,
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
    // Per-platform pre-rendered sprite (no tiling) so fractional
    // camera scales can't reveal tile seams. A shared onDraw below
    // still paints the neon top edge, corner ticks, and label above.
    k.add([
      k.sprite(`hatch-plat-${p.label}`),
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
      // collisionIgnore: ['bot'] — bots pass through each other horizontally
      // (parity with legacy engine). Stack-snap onto the partner's head is
      // still handled by the dedicated onUpdate below; bot↔platform/floor
      // collisions are unaffected because those tags differ.
      k.area({ shape: new k.Rect(k.vec2(0), 32, 40), collisionIgnore: ['bot'] }),
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
        // Wall-clock ms when the bot last moved meaningfully — used by
        // the idle-sleep watcher below.
        _lastActiveAt: 0,
        _isSleeping: false,
        // Set true while the task / arc system owns this bot's intent —
        // wander loop must NOT re-roll direction or play 'walk' over a
        // task's chosen clip (typing/think/sleep/wave).
        _taskOwned: false,
        // Animation arbiter override: scene/behavior/task can request a
        // priority clip (typing/think/hammer/wave/excited/sleep) for a
        // bounded window; arbiter keeps that clip even when vel.x ≠ 0
        // until `_forcedClipUntil` expires.
        _forcedClip: null as string | null,
        _forcedClipUntil: 0,
        // Wall-clock ms of the last successful 'land' clip stamp — used
        // by the onGround debounce so a noisy onGround stream (jitter
        // between tiles, post-wall-bounce micro-hops) can't keep
        // re-stamping the non-looping 'land' anim and freeze the bot
        // on its last frame.
        _lastLandAt: 0,
        // Bot pos.y at the END of the previous frame — used by the
        // bot-on-bot stack snap for swept-collision detection. Required
        // because at terminal fall velocity the upper bot can travel
        // 12-15 px between frames and overshoot a discrete head-window
        // check entirely.
        _prevPosY: 200,
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
    _lastActiveAt: number;
    _isSleeping: boolean;
    _taskOwned: boolean;
    _forcedClip: string | null;
    _forcedClipUntil: number;
    _lastLandAt: number;
    _prevPosY: number;
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
      // Debounce: KAPLAY emits onGround on every airborne→grounded
      // transition, including micro-bounces over tile boundaries and
      // post-wall-bounce vertical jitter. Without this guard the 'land'
      // clip (loop: false, ends on frame 16) gets re-stamped every few
      // frames and the bot freezes on the last land frame indefinitely.
      // Skip if we're already inside an active land window.
      const now = performance.now();
      if (bot._forcedClip === 'land' && now < bot._forcedClipUntil) return;
      // Also gate by recent landing time so two onGround events 50ms
      // apart can't both stamp 'land' (the 2nd would extend the window
      // and re-trigger the freeze).
      if (now - bot._lastLandAt < 240) return;
      bot._lastLandAt = now;
      bot._forcedClip = 'land';
      bot._forcedClipUntil = now + 180;
      try { bot.play('land'); } catch (_) {}
      spawnDust(bot.pos.x, bot.pos.y);
      // Squash & stretch was disabled — `bot.use(k.scale(...))` re-
      // attached a scale component on every land, and KAPLAY's
      // component update started reading pos on undefined slots after
      // a few cycles ("Cannot read 'x' of undefined" floods the
      // console). Land animation alone communicates impact well
      // enough; if we want squash later, attach scale ONCE at init
      // and mutate bot.scale in place instead of re-using.
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
      // A harder coefficient kicks in at high speed (right after a
      // throw) so the bot doesn't just trundle across the stage.
      if (bot.wanderDir === 0 && bot.isGrounded()) {
        const sp = Math.abs(bot.vel.x);
        const coef = sp > 300 ? 0.72 : sp > 120 ? 0.80 : 0.88;
        bot.vel.x *= coef;
        if (Math.abs(bot.vel.x) < 5) bot.vel.x = 0;
      }

      // Screen wrap for AIRBORNE (thrown) bots — classic toroidal
      // behaviour when a bot has been launched hard enough to leave
      // the stage. Ground-based bots still bounce off walls (see the
      // wander loop below). Threshold chosen so a bot has to really
      // fly past the edge (+ its own sprite width) before wrapping —
      // prevents accidental teleports on wall-bounce.
      if (!bot.isDragging && !bot.isGrounded()) {
        const pad = 40;
        if (bot.pos.x < -pad) bot.pos.x += LOGICAL_W + pad * 2;
        else if (bot.pos.x > LOGICAL_W + pad) bot.pos.x -= LOGICAL_W + pad * 2;
      }
    }
  });

  // ── Pixel-accurate HEAD_TOP per bot ─────────────────
  // Parity with the legacy engine: scan EVERY frame of each sprite sheet
  // for the highest non-transparent row — the visual top of the bot's
  // head (hair/antenna tip) across all clips. Stored as a Y offset
  // INSIDE the 48-pixel sprite box. Used by the bot-on-bot snap so the
  // upper bot's feet rest on the exact pixel tip of the lower bot's
  // head, no matter which animation frame the lower bot is on.
  //
  // Why all frames? frame 0 = idle_a; walk/jump/wave/typing have
  // different head positions. Stacking with idle-only data made the
  // upper bot float ~8 px when the lower played walk/land/jump.
  const SPRITE_H = 48;
  // Min head-top across all 92 frames per bot (pessimistic = safe stack).
  const headTopPx: Record<BotWho, number> = { craft: 8, code: 10 }; // sensible defaults until scan returns
  // Per-frame head-top, for the bonus precise stack snap (optional).
  const headTopByFrame: Record<BotWho, Int8Array> = {
    craft: new Int8Array(SHEET_FRAMES).fill(8),
    code:  new Int8Array(SHEET_FRAMES).fill(10),
  };
  const scanMinHeadTop = (src: string, who: BotWho) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = SHEET_FRAMES * SPRITE_H;
        c.height = SPRITE_H;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, SPRITE_H).data;
        const stride = c.width * 4;
        let globalMin = SPRITE_H;
        const perFrame = headTopByFrame[who];
        for (let f = 0; f < SHEET_FRAMES; f++) {
          const baseX = f * SPRITE_H;
          let frameMin = SPRITE_H;
          for (let y = 0; y < frameMin; y++) {
            const rowBase = y * stride;
            for (let x = baseX; x < baseX + SPRITE_H; x++) {
              if (d[rowBase + x * 4 + 3] > 128) {
                if (y < frameMin) frameMin = y;
                break;
              }
            }
          }
          perFrame[f] = frameMin;
          if (frameMin < globalMin) globalMin = frameMin;
        }
        headTopPx[who] = globalMin;
      } catch (_) { /* CORS or no-DOM — keep default */ }
    };
  };
  try { scanMinHeadTop('/sprites/craft.png', 'craft'); scanMinHeadTop('/sprites/code.png', 'code'); } catch (_) {}

  // Returns the per-frame headTop for the bot's CURRENT animation frame.
  // Falls back to the pessimistic min when the frame index can't be
  // resolved (e.g. anim still loading). Used by the optional precise
  // stack snap so the upper bot lands exactly on whatever pose the
  // lower is currently in.
  const headTopForCurrentFrame = (bot: BotObj, who: BotWho): number => {
    try {
      // KAPLAY exposes the current frame index on the sprite component.
      // It's the absolute frame within the sheet (0..SHEET_FRAMES-1).
      const f = (bot as unknown as { frame?: number }).frame;
      if (typeof f === 'number' && f >= 0 && f < SHEET_FRAMES) {
        return headTopByFrame[who][f];
      }
    } catch (_) {}
    return headTopPx[who];
  };

  // ── Bot-on-bot stacking snap ─────────────────────────
  // Feet of the upper bot land exactly on the VISIBLE head pixel of
  // the lower bot — not the bounding-box top — so the stack reads as
  // a physical contact instead of hovering in the hit-area's padding.
  //
  // Two complementary triggers (run every frame, after gravity has
  // already updated pos.y this tick):
  //
  //   1. STICK window: feet are already within ±N px of the head line
  //      and descending — pin the upper to the head. This is the
  //      "standing on partner" steady state. Window has to be a bit
  //      generous on the underside (gap < 0) because gravity nudges
  //      the upper down 0.5-2 px per frame between snaps.
  //
  //   2. SWEPT crossing: between previous frame and this one the upper
  //      bot crossed the head line top→bottom. Required because at
  //      terminal velocity (vel.y → 900 → 14.4 px per 16ms frame) a
  //      fast-falling bot would skip past a small discrete window in
  //      a single tick and never trigger the snap.
  //
  // The snap also clears the upper's downward velocity so the next
  // frame doesn't immediately push it back below the head line.
  k.onUpdate(() => {
    const pairs = [[craft, code], [code, craft]] as const;
    for (const [upper, lower] of pairs) {
      if (upper.isDragging || lower.isDragging) {
        upper._prevPosY = upper.pos.y;
        continue;
      }
      const uA = upper.worldArea();
      const lA = lower.worldArea();
      if (!uA || !lA || !uA.pts || !lA.pts) {
        upper._prevPosY = upper.pos.y;
        continue;
      }
      // Hit-area x-extents — horizontal-overlap test. A small inset
      // (4 px each side) avoids edge-cases where the upper is JUST
      // barely overlapping and would snap awkwardly. Better to require
      // a clear line-up before stacking.
      const INSET = 4;
      const uLeft  = Math.min(uA.pts[0].x, uA.pts[3].x) + INSET;
      const uRight = Math.max(uA.pts[1].x, uA.pts[2].x) - INSET;
      const lLeft  = Math.min(lA.pts[0].x, lA.pts[3].x);
      const lRight = Math.max(lA.pts[1].x, lA.pts[2].x);
      if (uRight < lLeft || uLeft > lRight) {
        upper._prevPosY = upper.pos.y;
        continue;
      }

      // Pixel-accurate head Y of the lower bot in world space. anchor
      // 'bot' → pos.y is the feet line; the sprite box extends SPRITE_H
      // upward from there, and the head pixel sits headTopForCurrentFrame
      // rows down from the box top. Per-frame lookup means the upper bot
      // tracks the lower bot's head as the lower's animation cycles
      // (walk bobs head a few px, jump tucks, etc.).
      const lowerWho = lower === craft ? 'craft' : 'code';
      const lowerHeadY = lower.pos.y - SPRITE_H + headTopForCurrentFrame(lower, lowerWho);

      // Upper feet Y == upper.pos.y (anchor='bot').
      const prevGap = lowerHeadY - upper._prevPosY;  // last frame
      const gap     = lowerHeadY - upper.pos.y;       // this frame

      // Trigger A: STICK — already at/just below the head line and
      //             not violently jumping up.
      const inStickWindow = gap > -14 && gap < 8 && upper.vel.y >= -50;

      // Trigger B: SWEPT — crossed the head line on this frame
      //             (was above last frame, is at-or-below this frame).
      //             Catches fast falls regardless of vel.y magnitude.
      const crossedDown = prevGap > 0 && gap <= 0 && upper.vel.y > 0;

      if (inStickWindow || crossedDown) {
        upper.pos.y = lowerHeadY;
        upper.vel.y = 0;
        upper._groundedOnBot = performance.now();
        // Refresh KAPLAY's body-grounded grace window so the upper bot
        // is allowed to jump off the partner without first "leaving
        // the platform" (matches normal floor behaviour).
        upper._groundedUntil = performance.now() + 120;
      }

      upper._prevPosY = upper.pos.y;
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

      // Task / arc system has authority — skip random wander entirely.
      // Tasks set bot.wanderDir directly when they want movement.
      if (bot._taskOwned) {
        // Still apply movement if the task has set a wanderDir.
        if (bot.wanderDir !== 0) bot.move(bot.wanderDir * WANDER_SPEED, 0);
        continue;
      }

      if (now >= bot.nextWanderAt) {
        // Re-roll direction: -1, 0, +1.
        const r = Math.random();
        bot.wanderDir = r < 0.33 ? -1 : r < 0.66 ? 0 : 1;
        scheduleWander(bot);
        // Occasional jump.
        if (Math.random() < 0.3) {
          try { bot.jump(520); } catch (_) {}
        }
        // Animation is owned by the arbiter (see §Animation arbiter).
        // We only set facing here; the arbiter picks idle/walk on the
        // next tick based on wanderDir / vel.x. Calling bot.play()
        // directly would clobber an active _forcedClip ('land' after
        // touchdown, 'wave' from a behavior, etc.).
        if (bot.wanderDir !== 0) {
          bot.flipX = bot.wanderDir < 0;
        }
      }

      if (bot.wanderDir !== 0) {
        bot.move(bot.wanderDir * WANDER_SPEED, 0);
      }

      // Wall bounce — parity with legacy engine. Bots reverse wanderDir at
      // the edges instead of wrapping around. Velocity is dampened (×0.4)
      // so the bounce reads as "bonk" rather than a hard ricochet, and
      // flipX is updated to face the new direction.
      //
      // The original guard only flipped wanderDir when the bot was
      // actively walking INTO the wall (wanderDir < 0 / > 0). That meant
      // a bot whose wander roll happened to land on `0` while standing
      // at the edge would get stuck against the wall for a full re-roll
      // cycle (3-7 s, sometimes chained to 14+ s if subsequent rolls
      // also picked 0 or "into the wall"). Now we also force-turn when
      // wanderDir == 0 OR points further into the wall, AND short-circuit
      // the wander timer so the next re-roll lands within ~0.8 s.
      const margin = 24;
      if (bot.pos.x < margin) {
        bot.pos.x = margin;
        bot.vel.x = Math.abs(bot.vel.x) * 0.4;
        if (bot.wanderDir <= 0) {
          bot.wanderDir = 1;
          bot.flipX = false;
          if (bot.nextWanderAt - now > 800) bot.nextWanderAt = now + 800;
        }
      } else if (bot.pos.x > LOGICAL_W - margin) {
        bot.pos.x = LOGICAL_W - margin;
        bot.vel.x = -Math.abs(bot.vel.x) * 0.4;
        if (bot.wanderDir >= 0) {
          bot.wanderDir = -1;
          bot.flipX = true;
          if (bot.nextWanderAt - now > 800) bot.nextWanderAt = now + 800;
        }
      }
    }
  });

  // ── Idle sleep watcher ───────────────────────────────
  // After ~30 s with no meaningful movement and no active bubble for the
  // bot, switch the clip to 'sleep'. Any nudge wakes them back to idle.
  const SLEEP_AFTER_MS = 30_000;
  k.onUpdate(() => {
    if (reducedMotion) return;
    const now = performance.now();
    for (const bot of bots) {
      const speed = Math.abs(bot.vel.x) + Math.abs(bot.vel.y);
      // A task-owned bot is always considered "active" — even when idle
      // typing/thinking/napping by design — so the sleep watcher doesn't
      // override its scripted clip with the generic 'sleep' anim.
      const moving = speed > 6 || bot.wanderDir !== 0 || bot.isDragging
        || !bot.isGrounded() || bot._taskOwned;
      if (moving) {
        bot._lastActiveAt = now;
        if (bot._isSleeping) {
          // Just flip the flag — arbiter picks idle/walk based on
          // movement state on the next tick. Direct bot.play('idle')
          // here would clobber an active _forcedClip from a behavior
          // that just woke the bot (e.g. 'wave' on highfive).
          bot._isSleeping = false;
        }
        continue;
      }
      if (bot._lastActiveAt === 0) bot._lastActiveAt = now;
      if (!bot._isSleeping && now - bot._lastActiveAt > SLEEP_AFTER_MS) {
        bot._isSleeping = true;
        // Arbiter sees _isSleeping and returns 'sleep' next tick.
      }
    }
  });

  // ── Animation arbiter ─────────────────────────────────
  // Single source of truth for every-frame clip selection. Solves the
  // long-running glitch where a bot would `bot.play('walk')` from the
  // wander loop, then a behavior/scene would `bot.play('typing')`, and
  // the next wander tick would clobber it back to 'walk' — leaving the
  // bot sliding with the wrong anim, or worse, stuck on idle while
  // moving (vel.x ≠ 0 + idle clip = "skating" bug from screenshots).
  //
  // Priority order each frame:
  //   1. _taskOwned    → don't touch (tasks own the clip explicitly)
  //   2. _forcedClip valid window → forced clip (wins over physics state
  //      so dialogue 'typing'/'think'/'hammer'/'wave' are honoured even
  //      mid-air or mid-drag — caller is responsible for short windows)
  //   3. isDragging    → 'tumble'
  //   4. _isSleeping   → 'sleep' (sleep watcher's clip)
  //   5. !isGrounded   → 'jump'
  //   6. moving (|vel.x|>6 or wanderDir≠0 or steered) → 'walk'
  //   7. otherwise     → 'idle'
  //
  // The arbiter only calls bot.play(...) when the desired clip differs
  // from the currently playing one — re-issuing the same anim would
  // restart it every frame and break loop timing.
  const pickClip = (bot: typeof craft): string | null => {
    if (bot._taskOwned) return null;            // tasks/arcs/ai-loop own the clip
    const now = performance.now();
    if (bot._forcedClip && now < bot._forcedClipUntil) return bot._forcedClip;
    // Expired forced window — clear so the next force can stamp cleanly.
    if (bot._forcedClip && now >= bot._forcedClipUntil) {
      bot._forcedClip = null;
      bot._forcedClipUntil = 0;
    }
    if (bot.isDragging) return 'tumble';
    if (bot._isSleeping) return 'sleep';
    // Bots ignore each other's collision (collisionIgnore: ['bot']), so
    // standing on a partner's head doesn't register with KAPLAY's body
    // component as grounded. The stack-snap above stamps _groundedOnBot
    // every tick the upper bot rests on the lower; treat that as a
    // valid "ground" source so the arbiter doesn't lock the upper into
    // 'jump' forever while it's actually standing on the partner.
    const stackedRecently = now - bot._groundedOnBot < 80;
    if (!bot.isGrounded() && !stackedRecently) return 'jump';
    if (Math.abs(bot.vel.x) > 6 || bot.wanderDir !== 0) return 'walk';
    return 'idle';
  };
  k.onUpdate(() => {
    for (const bot of bots) {
      const want = pickClip(bot);
      if (!want) continue;
      try {
        const cur = (bot as unknown as { getCurAnim?: () => { name?: string } | null }).getCurAnim?.();
        if (cur && cur.name === want) continue;
        bot.play(want);
      } catch (_) { /* sprite component might be mid-swap */ }
    }
  });

  const forceClip = (who: BotWho, clip: string, durationMs: number) => {
    const bot = who === 'craft' ? craft : code;
    if (!bot) return;
    bot._forcedClip = clip;
    bot._forcedClipUntil = performance.now() + Math.max(0, durationMs);
    // Stamp immediately so consumers see the visual change on the next
    // frame even before the arbiter ticks (it's order-dependent).
    try {
      const cur = (bot as unknown as { getCurAnim?: () => { name?: string } | null }).getCurAnim?.();
      if (!cur || cur.name !== clip) bot.play(clip);
    } catch (_) {}
  };

  // ── Wall bounce for thrown / dropped bots ─────────────
  // Even when not actively wandering (e.g. mid-tumble after throw), a bot
  // hitting a wall should reflect velocity instead of escaping past the
  // edge. Runs after wander loop so it acts as the final clamp.
  k.onUpdate(() => {
    for (const bot of bots) {
      if (bot.isDragging) continue;
      const margin = 24;
      if (bot.pos.x < margin && bot.vel.x < 0) {
        bot.pos.x = margin;
        bot.vel.x = -bot.vel.x * 0.5;
      } else if (bot.pos.x > LOGICAL_W - margin && bot.vel.x > 0) {
        bot.pos.x = LOGICAL_W - margin;
        bot.vel.x = -bot.vel.x * 0.5;
      }
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
    // While dragging, the arbiter forces 'tumble' (isDragging branch).
    // We override briefly with 'wave' for a friendly pickup feel — the
    // arbiter respects this only during the forced window, so on the
    // next tick it goes back to 'tumble' until release. Keep the wave
    // window short (250ms) so most of the drag reads as 'tumble'.
    bot._forcedClip = 'wave';
    bot._forcedClipUntil = performance.now() + 250;
    try { bot.play('wave'); } catch (_) {}
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (!dragged || ev.pointerId !== activePointerId) return;
    const { x: rawX, y: rawY } = toWorld(ev);
    // Clamp the drag position inside the stage so the user can't drop
    // a bot through the floor, into an off-screen void, or past the
    // walls. Feet (pos.y for anchor='bot') can reach FLOOR_TOP_Y at
    // most — below that the body would clip through the ground.
    const DRAG_MARGIN = 20;
    const x = Math.max(DRAG_MARGIN, Math.min(LOGICAL_W - DRAG_MARGIN, rawX));
    const y = Math.max(60, Math.min(FLOOR_TOP_Y, rawY));
    dragged.pos.x = x;
    dragged.pos.y = y;
    const now = performance.now();
    dragHistory.push({ x, y, t: now });
    while (dragHistory.length > 0 && now - dragHistory[0].t > 120) {
      dragHistory.shift();
    }
    // Reactor: the non-dragged bot turns to watch its partner being moved.
    const watcher = dragged === craft ? code : craft;
    if (watcher && !watcher.isDragging) {
      try { watcher.flipX = x < watcher.pos.x; } catch (_) {}
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
    // Force tumble for ~1.5s so the arbiter doesn't immediately swap
    // to 'jump' (airborne) the moment isDragging clears. onGround()
    // installs its own 'land' force which supersedes this on touchdown.
    bot._forcedClip = 'tumble';
    bot._forcedClipUntil = performance.now() + 1500;
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

    // Smooth continuous zoom. The floor / platforms are now rendered as
    // single full-size sprites (no tile boundaries inside them), so any
    // fractional scale renders cleanly — we can lerp through without
    // the shimmer that plagued the tile-based version.
    //   dist ≤ 120 → 2.0×    (close-up: bots chatting / interacting)
    //   dist ≥ 700 → 1.0×    (whole stage visible at scale 1, since
    //                         visible width = LOGICAL_W / 1.0 = 1200 =
    //                         the world width)
    //   in between → linearly interpolated target, lerped over time.
    const dist = craft.pos.dist(code.pos);
    const d01  = Math.min(1, Math.max(0, (dist - 120) / (700 - 120)));
    const targetScale = 2.0 - d01 * 1.0; // 2.0 → 1.0
    const curS = k.getCamScale().x;
    const nextScale = k.lerp(curS, targetScale, 0.06);
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
    // Full-size hatch sprites mean sub-pixel positions no longer cause
    // tile seams; let the camera translate smoothly.
    k.setCamPos(cxT, cyT);
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

    // Clamp horizontally so the bubble stays inside the stage even when
    // the bot is hugging the left/right edge. `.kc-stage` has overflow:
    // hidden so an unclamped bubble simply gets sliced and the dialogue
    // becomes unreadable. Tail (`::after`) is offset locally via the
    // --tail-offset CSS variable so it still points at the bot's head.
    const halfW = (el.offsetWidth || 260) / 2;
    const margin = 8;
    const minPx = halfW + margin;
    const maxPx = rect.width - halfW - margin;
    let clampedPx = px;
    if (maxPx > minPx) {
      clampedPx = Math.max(minPx, Math.min(maxPx, px));
    }
    const tailOffset = px - clampedPx;
    // Also clamp vertically — if the bot is near the top of the stage
    // the bubble would otherwise stick into the wordmark or get clipped
    // by the stage's top edge. Push it below the bot's head when there
    // isn't enough room above.
    const bubbleH = el.offsetHeight || 40;
    const minPy = bubbleH + margin;       // top of stage
    let clampedPy = py;
    if (py < minPy) {
      // Flip below bot's head: tail points up. We do this by switching
      // translate-Y from -100% (bubble above anchor) to 0% (below) and
      // marking with a class so CSS can flip the tail.
      clampedPy = (projY + 30) * ky;       // 30 px below feet line
      el.classList.add('kc-bubble--below');
    } else {
      el.classList.remove('kc-bubble--below');
    }
    const yAnchor = el.classList.contains('kc-bubble--below') ? '0%' : '-100%';
    el.style.transform = `translate(${clampedPx}px, ${clampedPy}px) translate(-50%, ${yAnchor})`;
    el.style.setProperty('--tail-offset', `${tailOffset}px`);
  };

  k.onUpdate(() => {
    if (bubbles.craft?.classList.contains('visible')) positionBubble('craft');
    if (bubbles.code?.classList.contains('visible')) positionBubble('code');
  });

  // Per-bubble typewriter handle — cancels in-flight reveal when a new
  // bubble takes over the same speaker (e.g. langchange mid-line).
  const typewriterTimers: Record<BotWho, number | null> = { craft: null, code: null };

  const showBubble = (who: BotWho, text: string, holdMs = 2400) => {
    const el = ensureBubble(who);
    // Face the conversation partner — flipX so the speaker visually
    // "looks at" the other bot. Mirrors legacy engine.legacy.js behaviour.
    const speaker = who === 'craft' ? craft : code;
    const partner = who === 'craft' ? code : craft;
    if (speaker && partner) {
      try { speaker.flipX = partner.pos.x < speaker.pos.x; } catch (_) {}
      // Wake from sleep — talking implies activity.
      if (speaker._isSleeping) {
        speaker._isSleeping = false;
        speaker._lastActiveAt = performance.now();
      }
    }
    // DOM-build the "WHO:" label + body so CSS can style them
    // separately. textContent-based, no innerHTML → no XSS surface.
    el.replaceChildren();
    const kicker = document.createElement('span');
    kicker.className = 'who';
    kicker.textContent = `${who}:`;
    el.appendChild(kicker);
    const textNode = document.createTextNode('');
    el.appendChild(textNode);
    el.classList.add('visible');
    positionBubble(who);
    // Typewriter reveal — character-by-character, ~18ms/char (legacy parity).
    // Reduced motion: dump the full text instantly to skip the staggered FX.
    if (typewriterTimers[who]) {
      clearTimeout(typewriterTimers[who]!);
      typewriterTimers[who] = null;
    }
    if (reducedMotion) {
      textNode.data = text;
    } else {
      let i = 0;
      const step = () => {
        if (i < text.length) {
          textNode.data += text[i++];
          typewriterTimers[who] = window.setTimeout(step, 18);
        } else {
          typewriterTimers[who] = null;
        }
      };
      step();
    }
    if (bubbleTimers[who]) clearTimeout(bubbleTimers[who]!);
    bubbleTimers[who] = window.setTimeout(() => {
      el.classList.remove('visible');
      if (typewriterTimers[who]) {
        clearTimeout(typewriterTimers[who]!);
        typewriterTimers[who] = null;
      }
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
    ensureEventHatchSprite: ensureEventHatch,
    forceClip,
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
