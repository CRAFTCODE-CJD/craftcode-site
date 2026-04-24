// ─── Data modules ───
// SCENES come from the dialogue database, CLIPS/FRAME_ORDER from the
// animation catalog. Engine logic below is agnostic of both.
import { SCENES } from './dialogues.data.js';
import { FRAME_ORDER, fIdx, CLIPS, STATE_TO_CLIP } from './frames.data.js';

  // ═══ COMPANIONS — dialogue engine + runtime ═════════
  // ════════════════════════════════════════════════════
  //  This file is the engine. The DATA it consumes lives in sibling
  //  modules under ./companions/:
  //
  //    dialogues.data.js  — SCENES[] database (dialogue content)
  //    frames.data.js     — FRAME_ORDER, CLIPS, STATE_TO_CLIP, fIdx()
  //
  //  See the respective files for schemas + lore notes. Everything below
  //  this header is ENGINE — physics, rendering, dialogue picker,
  //  pointer input, FX, HUD, reactions, macros.
  // ════════════════════════════════════════════════════


  // ── Dialogue engine ──────────────────────────────────
  const dialogue = {
    flags: {
      rapport: 50,                // rapport 0-100; other flags set dynamically
      chertyozh_7_step: 0,        // long-running project progress 0..5
    },
    flagExpiry: {},               // { name: ts_ms when expires }
    cooldowns: {},                // { sceneId: earliestReplayTs_ms }
    history: [],                  // last 32 played scenes

    // ── Life simulation ──
    // Three math accumulators driven from the physics tick() — cheap
    // per-frame, no AI, no state machine. Scene `requires(ctx)` predicates
    // read from here to gate time-of-day / mood-aware scenes.
    sim: {
      workshopTime: 0,            // 0..1 — 0=morning, 0.5=noon, 1=evening (8-min cycle)
      mood: { craft: 50, code: 50 },  // 0..100 per bot, drifts toward 50
      curiosity: 0,               // 0..100 — grows while player is inactive
      idleTimer: 0,               // seconds since last user interaction
      timePhase: 'day',           // 'morning' | 'day' | 'evening' (derived)
      chertyozhTimer: 0,          // s since last chertyozh_7_tick
      stuckTimer: 0, stuckFired: false,
      platformTimer:  { craft: 0, code: 0 },
      platformFired:  { craft: false, code: false },
      bumpHistory:    { craft: [], code: [] },
      lostFired:      { craft: false, code: false },
      stackFired:     { craft: false, code: false },
      // Click-without-spam tracking for the "gentle touch" hook
      lastClickAt:    { craft: 0, code: 0 },
      clickStreak:    { craft: 0, code: 0 },
    },

    // Bump a bot's mood by `amount` (can be negative), clamped 0..100.
    modifyMood(who, amount) {
      if (this.sim.mood[who] !== undefined) {
        this.sim.mood[who] = Math.max(0, Math.min(100, this.sim.mood[who] + amount));
      }
    },
    // User interacted with a bot (touched, dragged, placed) — reset the
    // "player is gone" accumulators so curiosity stops climbing.
    resetInteraction() {
      this.sim.idleTimer = 0;
      this.sim.curiosity = 0;
    },
    // High-level event trigger: pick a scene by tag AND play it through
    // the engine's scene-reaction path. Gemini's event hooks call this
    // (equivalent to the older `reactFromScene` but for tag-only events
    // that don't need who-remapping).
    //
    // Returns true if a scene was found + queued, false otherwise.
    fire(tag, whoRemap) {
      const scene = this.pick(tag);
      if (!scene) return false;
      const lines = this.play(scene);
      const resolved = whoRemap ? this.resolveLines(lines, whoRemap) : lines;
      if (typeof window !== 'undefined' && window.__companions?.playSequence) {
        // Only fire if the engine isn't already mid-dialogue; otherwise
        // the new scene would cut off the current typewriter.
        if (window.__companions.dialogueState !== 'talking') {
          window.__companions.playSequence(resolved);
        }
      }
      return true;
    },

    setFlag(name, value, ttlSec) {
      this.flags[name] = value;
      if (ttlSec) this.flagExpiry[name] = performance.now() + ttlSec * 1000;
    },
    clearExpired() {
      const now = performance.now();
      for (const name in this.flagExpiry) {
        if (this.flagExpiry[name] <= now) {
          delete this.flags[name];
          delete this.flagExpiry[name];
        }
      }
    },
    pick(tag) {
      this.clearExpired();
      const now = performance.now();
      const candidates = SCENES.filter(s =>
        s.tags.includes(tag) &&
        (!this.cooldowns[s.id] || this.cooldowns[s.id] <= now) &&
        (!s.requires || s.requires(this))
      );
      if (!candidates.length) return null;
      const total = candidates.reduce((a, b) => a + (b.weight || 1), 0);
      let r = Math.random() * total;
      for (const c of candidates) {
        r -= (c.weight || 1);
        if (r <= 0) return c;
      }
      return candidates[candidates.length - 1];
    },
    play(scene) {
      this.cooldowns[scene.id] = performance.now() + ((scene.cooldown || 30) * 1000);
      this.history.push({ id: scene.id, t: performance.now() });
      if (this.history.length > 32) this.history.shift();
      if (scene.effect) try { scene.effect(this); } catch (_) {}
      // Stamp each line with its i18n key (`dialogue.<scene.id>.l<N>`, 1-based).
      // Cloning so we don't mutate the SCENES database.
      return scene.lines.map((l, i) => ({ ...l, _key: `dialogue.${scene.id}.l${i + 1}` }));
    },
    // Map a scene's 'craft' placeholder lines to whoever the event is about,
    // so who-agnostic scenes can play for either character.
    resolveLines(lines, targetWho) {
      if (!targetWho) return lines;
      const other = targetWho === 'craft' ? 'code' : 'craft';
      return lines.map(l => ({
        ...l,
        who: l.who === 'craft' ? targetWho : (l.who === 'code' ? other : l.who),
      }));
    },
    // Runtime i18n lookup — reads line text via window.__i18n.t() if the
    // line was stamped with `_key` (see play()). Falls back to raw source.
    // Also used for ad-hoc keys (inner-monologue pool).
    _i18nText(key, fallback) {
      try {
        const api = typeof window !== 'undefined' ? window.__i18n : null;
        if (api && typeof api.t === 'function') {
          const v = api.t(key);
          if (typeof v === 'string' && v.length) return v;
        }
      } catch (_) {}
      return fallback;
    },
    // Rapport clamps 0-100. Events bump it; decays via scene count are implicit.
    adjustRapport(delta) {
      this.flags.rapport = Math.max(0, Math.min(100, (this.flags.rapport ?? 50) + delta));
      // Mirror to the Playground HUD (no-op if element isn't on the page).
      const hud = typeof document !== 'undefined' && document.getElementById('hud-rapport');
      if (hud) hud.textContent = this.flags.rapport;
    },
    // Central bookkeeping after any notable event.
    recordEvent(event, who) {
      switch (event) {
        case 'grab':
          this.setFlag(`${who}_grabbed_recent`, 1, 15);
          break;
        case 'throw':
          this.setFlag(`${who}_airborne_recent`, 1, 25);
          this.flags.thrown_count = (this.flags.thrown_count || 0) + 1;
          this.adjustRapport(-2);
          break;
        case 'land_soft':
          this.setFlag(`${who}_landed_recent`, 1, 20);
          this.adjustRapport(+1);
          break;
        case 'land_hard':
          this.setFlag(`${who}_landed_hard_recent`, 1, 45);
          this.adjustRapport(-1);
          break;
        case 'accent_change':
          this.setFlag('accent_changed_recent', 1, 60);
          break;
        case 'click_spam':
          this.setFlag(`${who}_annoyed`, 1, 40);
          this.adjustRapport(-1);
          break;
        case 'idle_play':
          this.adjustRapport(+1);  // sharing a moment bonds them
          break;
      }
    },
  };


  const companions = {
    els: {
      container: document.querySelector('.companions'),
      craft: document.querySelector('[data-who="craft"]'),
      code:  document.querySelector('[data-who="code"]'),
    },
    bubbles: {
      craft: document.getElementById('bubble-craft'),
      code:  document.getElementById('bubble-code'),
    },

    // ── Roster ──
    // CRAFT + CODE — the core duo, always active.
    // Plugin-bots (SPRITE, MANU, SCOUT) are registered here but not spawned
    // until activateBot(id) pushes them into BOT_IDS + creates a DOM element.
    // Engine loops always iterate `this.BOT_IDS` so the physics, sim, and
    // clip drivers automatically scale when a guest bot arrives.
    BOT_IDS: ['craft', 'code'],
    KNOWN_BOTS: ['craft', 'code', 'sprite', 'manu', 'scout'],

    // ── Physics constants ──
    S: 48,              // sprite render size (matches CSS .companion width/height)
    SIDE_M: 6,          // horizontal margin from viewport edges
    FLOOR_M: 1,         // bottom margin — feet land 1 px above the dashed floor line.
                        // NOTE: now that FOOT_Y is the actual VISIBLE feet pixel
                        // row (not the full 48-px sprite box), this margin is a
                        // true cosmetic gap, not padding-compensation.
    PLATFORM_M: 2,      // feet-above-platform gap on obstacle-top landings.
                        // Kept tiny so the bot visibly "stands" on the platform
                        // rather than hovering above it. FOOT_Y is the real
                        // pixel baseline so 2 px reads as light floor contact.
    GRAVITY: 1450,      // px/s² — gravitational pull.
                        // Lowered from 1800 for a slightly longer hang-time on
                        // tosses & throws; makes the arc feel springy rather
                        // than yanked-down.
    AIR_DRAG_X: 0.985,  // horizontal air-resistance per tick (applied while airborne)
    AIR_DRAG_Y: 0.992,  // vertical air-resistance per tick — smooths ballistic arc
    MAX_THROW_VY: 1400, // cap on initial |vy| from pointer-release. Without this
                        // a flicked bot could rocket straight up and off-stage.
    WALK_SPEED: 40,     // px/s — reduced from perim-based (was ~0.006/frame)
    MAX_V: 2200,        // clamp on throw velocity
    BOUNCE: 0.55,       // restitution on wall / obstacle / ceiling (matches designer spec)
    FRICTION: 0.55,     // horizontal damping on floor impact
    THROW_MULTIPLIER: 1.8,    // toss velocity = avg-sample-delta × this

    // ── Hit-boxes per bot ──
    // The sprite is 48×48 but the actual robot silhouette is much smaller
    // (see public/sprites/ANIMATIONS.md § 5). Without per-bot padding, bots
    // "bump" their own invisible corners and platforms feel misaligned.
    //
    // Values are render-pixel insets from the 48×48 sprite box.
    // Source silhouette rows × 1.5 scale factor (32 src → 48 render).
    //   CRAFT body: src cols 11-21 (10w), rows 9-22 + legs to 26 → 16w×33h render
    //   CODE  body: src cols 9-22 (14w), rows 11-20 + legs to 24 → 21w×22h render
    HITBOX: {
      craft: { padL: 13, padR: 13, padT: 9,  padB: 8 },   // 22 × 31
      code:  { padL: 8,  padR: 8,  padT: 15, padB: 12 },  // 32 × 21
    },

    // Pixel Y of the feet-bottom line, measured from sprite.top (render px).
    // Per ANIMATIONS.md § "Pivot": feet baseline sits at source y=26 (CRAFT)
    // and y=24 (CODE). Scale factor = 48/32 = 1.5 →
    //   craft: 26 × 1.5 = 39  (hitbox padB=8 → hb.bottom = p.y+40 → 1px below)
    //   code : 24 × 1.5 = 36  (hitbox padB=12 → hb.bottom = p.y+36, exact)
    // Using these values means p.y + FOOT_Y is where the VISIBLE soles render,
    // so FLOOR_M / PLATFORM_M are true cosmetic gaps, not padding comp.
    // Previously set to 48 (full sprite box) which made bots float 9-12 px
    // above the floor — user-visible "not standing on the ground" bug.
    FOOT_Y: { craft: 39, code: 36 },

    // Pixel-measured "head top" — the Y (in render px, relative to
    // sprite.top) of the first opaque pixel at the top of the sprite.
    // Initialised asynchronously by _measureHeadTops() on first init.
    // Default 0 = sprite top (safe fallback until the image decodes).
    HEAD_TOP: { craft: 0, code: 0 },

    // Per-character state (bottom-only; no wall/perim anymore)
    pos: {
      craft: { x: 80,  y: 0, vx: 0, vy: 0, facing: 'right', state: 'idle',
               grounded: false, walkTarget: null },
      code:  { x: 200, y: 0, vx: 0, vy: 0, facing: 'right', state: 'idle',
               grounded: false, walkTarget: null },
    },

    dialogueState: 'idle',
    muted: localStorage.getItem('craftcode-companions-muted') === '1',
    clickCounts: { craft: 0, code: 0 },
    queue: [],
    konamiBuffer: [],
    konamiCode: ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'],
    idleTimer: null,
    wanderTimer: null,
    thinkingTimer: null,
    tossTimer: null,
    clickResetTimer: null,
    pendingAction: null,   // queued scene-end action (e.g. { type: 'toss', attacker, victim })
    lastPicked: null,
    lastFrameTime: 0,

    // Active drag tracking: { who, pointerId, offsetX, offsetY, history: [{x,y,t}] }
    activeDrag: null,
    pointerMoved: false,       // was the current press a drag, or a click?

    // All physics coords are RELATIVE to the .companions container, which is
    // position:absolute + bottom:0 on <body>. So floorY is the container's
    // own inner height minus margin/sprite, NOT window.innerHeight.
    // DEPRECATED: generic floor that assumed a 48-tall sprite filled its box.
    // Kept as a fallback for callers that haven't been migrated. Prefer
    // `floorYFor(who)` which lines the bot's FEET up with the floor.
    floorY() {
      const c = this.els.container;
      return (c ? c.clientHeight : 480) - this.FLOOR_M - this.S;
    },
    // "Classic" partner: for CRAFT↔CODE it's the fixed duo partner. For
    // guest/plugin bots it falls back to the nearest other active bot
    // (so when SPRITE is in the stage, "partner" for a reaction is
    // whoever's closest — usually CRAFT or CODE). Returns null if there
    // is no other bot on stage (single-bot corner case during activation).
    partnerOf(who) {
      if (who === 'craft' && this.BOT_IDS.includes('code'))  return 'code';
      if (who === 'code'  && this.BOT_IDS.includes('craft')) return 'craft';
      return this.nearestOther(who);
    },
    // Closest other active bot to `who`, measured by x-distance of sprites.
    nearestOther(who) {
      const p = this.pos[who];
      if (!p) return null;
      let best = null, bestD = Infinity;
      for (const other of this.BOT_IDS) {
        if (other === who) continue;
        const po = this.pos[other];
        if (!po) continue;
        const d = Math.hypot((po.x - p.x), (po.y - p.y));
        if (d < bestD) { bestD = d; best = other; }
      }
      return best;
    },

    // Per-bot floor Y (the value p.y should equal when the bot is grounded).
    // Derived so that feet sit `FLOOR_M` px above the stage floor line.
    //   p.y + FOOT_Y[who] === containerHeight - FLOOR_M
    floorYFor(who) {
      const c = this.els.container;
      const ch = c ? c.clientHeight : 480;
      return ch - this.FLOOR_M - this.FOOT_Y[who];
    },
    containerWidth() {
      const c = this.els.container;
      return c ? c.clientWidth : window.innerWidth;
    },

    // Hit-box rect for `who` in container-local coords. The collision AABB
    // matches the robot silhouette, NOT the 48×48 sprite box. Every
    // collision math site consumes this instead of raw (p.x, p.y, S, S).
    _hb(who) {
      const p = this.pos[who];
      const pad = this.HITBOX[who];
      return {
        left:   p.x + pad.padL,
        top:    p.y + pad.padT,
        right:  p.x + this.S - pad.padR,
        bottom: p.y + this.S - pad.padB,
        w:      this.S - pad.padL - pad.padR,
        h:      this.S - pad.padT - pad.padB,
      };
    },

    // Scan each bot's sprite sheet for the topmost opaque pixel in
    // frame 0 (idle_a). Result is stored in this.HEAD_TOP[who] as
    // a RENDER-space pixel offset from sprite.top. Used by the stand
    // -on-head snap so the faller's feet land on the actual visible
    // head pixel (not on sprite.top, which includes transparent top
    // padding, nor on hitbox.top, which is inside the padding).
    //
    // Idempotent — multiple calls are no-ops. Runs once on init().
    // Pure DOM (<img> + canvas), no network beyond the already-loaded
    // sprite sheet, so measurement is cheap and non-blocking.
    _measureHeadTops() {
      if (this._headTopsMeasured) return;
      this._headTopsMeasured = 'loading';
      const FRAME_W = 32;         // source frame width
      const FRAME_H = 32;         // source frame height
      const RENDER = this.S / FRAME_H;  // scale (48/32 = 1.5)
      const measure = (who) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = FRAME_W; canvas.height = FRAME_H;
            const ctx = canvas.getContext('2d');
            // Draw frame 0 (idle_a) at source resolution
            ctx.drawImage(img, 0, 0, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
            const data = ctx.getImageData(0, 0, FRAME_W, FRAME_H).data;
            // Find topmost row with any opaque pixel (alpha > 40)
            let topRow = FRAME_H;
            outer: for (let y = 0; y < FRAME_H; y++) {
              for (let x = 0; x < FRAME_W; x++) {
                if (data[(y * FRAME_W + x) * 4 + 3] > 40) {
                  topRow = y; break outer;
                }
              }
            }
            this.HEAD_TOP[who] = Math.round(topRow * RENDER);
          } catch (e) {
            /* canvas tainted by CORS — keep default 0 */
          }
        };
        img.src = `/sprites/${who}.png`;
      };
      measure('craft');
      measure('code');
      this._headTopsMeasured = true;
    },

    // "Is this grounded bot standing on anything?" Returns true if the
    // feet no longer rest on the main floor NOR on any platform top that
    // overlaps the bot's hitbox x-range. The caller then un-grounds it
    // so gravity + airborne collision resume next frame.
    //
    // Dragged bots are never "unsupported" — the pointer owns position.
    _isUnsupported(who) {
      if (this.activeDrag && this.activeDrag.who === who) return false;
      const p = this.pos[who];
      const hb = this._hb(who);
      const feetY = p.y + this.FOOT_Y[who];
      const ch = this.els.container ? this.els.container.clientHeight : 480;
      // Tolerance = PLATFORM_M + 1: the bot sits that high above the
      // surface after a snap, so the check needs to match the snap height.
      const tol = Math.max(this.PLATFORM_M, 2) + 1;

      // 1. On the main floor line? Stay grounded.
      if (Math.abs(feetY - (ch - this.FLOOR_M)) < tol) return false;

      // 2. On any static platform's top with x-overlap?
      if (this._obstacles && this._obstacles.length) {
        for (const o of this._obstacles) {
          const target = o.y - this.PLATFORM_M;
          if (feetY < target - tol || feetY > target + tol) continue;
          if (hb.right <= o.x || o.x + o.w <= hb.left) continue;
          return false;
        }
      }

      // 3. Standing on the PARTNER's head? Partner acts as a moving
      //    platform — if they walk away, x-overlap fails and we fall.
      //    The target must match the standOn() snap EXACTLY —
      //    partner.y + partner's measured HEAD_TOP (pixel-accurate
      //    first-opaque row). Using the same anchor on both sides
      //    prevents "landed, then unsupported on the next tick" loops.
      const partner = this.partnerOf(who);
      const pp = this.pos[partner];
      if (pp.grounded) {
        const ph = this._hb(partner);
        const headTarget = pp.y + (this.HEAD_TOP[partner] || 0);
        if (Math.abs(feetY - headTarget) < 4               // tight Y tolerance
            && hb.right > ph.left && hb.left < ph.right) {
          return false;                                    // supported by partner's head
        }
      }

      return true;
    },

    init() {
      // Idempotent — cheap guard in case BootToPlayground + auto-init both
      // fire (shouldn't happen, but protects against future callers).
      if (this._started) return;
      // Refresh DOM refs in case the component mounted after script load.
      this.els.container = document.querySelector('.companions');
      this.els.craft     = document.querySelector('[data-who="craft"]');
      this.els.code      = document.querySelector('[data-who="code"]');
      this.bubbles.craft = document.getElementById('bubble-craft');
      this.bubbles.code  = document.getElementById('bubble-code');
      if (!this.els.container || !this.els.craft || !this.els.code) return;
      this._started = true;

      if (this.muted) this.applyMute();

      const fxLayer = document.querySelector('.fx-layer');
      // No longer appending to body — we want it absolute inside the stage
      // so simulation coordinates (p.x, p.y) match style.left/top.

      // Drop both on the floor at start
      this.pos.craft.x = 80;
      this.pos.craft.y = this.floorYFor('craft');
      this.pos.craft.grounded = true;
      this.pos.code.x  = Math.min(200, this.containerWidth() - this.SIDE_M - this.S - 20);
      this.pos.code.y  = this.floorYFor('code');
      this.pos.code.grounded = true;
      this.applyPosition('craft');
      this.applyPosition('code');

      // Bootstrap the clip driver with idle on both bots so the first
      // rendered frame isn't a black square. Also initialises bump queue.
      this.pos.craft.recentBumps = [];
      this.pos.code.recentBumps  = [];
      this.playClip('craft', 'idle');
      this.playClip('code',  'idle');

      // Pixel-scan the idle_a frame of each sprite to measure where the
      // visible head actually begins. The result replaces sprite.y as
      // the "head surface" used for stand-on-head snapping + support.
      // Async (image decode), updates HEAD_TOP in place when ready.
      this._measureHeadTops();

      this.BOT_IDS.forEach(who => {
        const el = this.els[who];
        // Pointer events unify mouse + touch; we decide click vs drag on release
        el.addEventListener('pointerdown', (e) => this.onPointerDown(who, e));
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.onClick(who);
          }
        });
      });
      document.addEventListener('pointermove',   (e) => this.onPointerMove(e));
      document.addEventListener('pointerup',     (e) => this.onPointerUp(e));
      document.addEventListener('pointercancel', (e) => this.onPointerUp(e));

      const muteBtn = document.querySelector('[data-toggle-mute]');
      if (muteBtn) {
        muteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleMute();
        });
      }

      document.addEventListener('keydown', (e) => {
        const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        this.konamiBuffer.push(key);
        if (this.konamiBuffer.length > this.konamiCode.length) {
          this.konamiBuffer = this.konamiBuffer.slice(-this.konamiCode.length);
        }
        if (this.konamiBuffer.length === this.konamiCode.length &&
            this.konamiBuffer.every((k, i) => k === this.konamiCode[i])) {
          this.konamiBuffer = [];
          this.triggerKonami();
        }
      });

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          // If the tab goes hidden mid-drag, the matching pointerup may never
          // arrive — engine would stay `dragging` forever, bot frozen in the
          // held state. Treat hidden as an implicit pointercancel.
          if (this.activeDrag) {
            const who = this.activeDrag.who;
            this.activeDrag = null;
            this.pointerMoved = false;
            if (this.pos[who]) {
              this.pos[who].vx = 0;
              this.pos[who].vy = 0;
              this.pos[who].grounded = false;
            }
            this.setCharState(who, 'falling');
          }
          clearTimeout(this.idleTimer);
          clearTimeout(this.wanderTimer);
          clearTimeout(this.thinkingTimer);
          clearTimeout(this.tossTimer);
        } else if (!this.muted) {
          if (this.dialogueState === 'idle') this.scheduleIdle(15000);
          this.scheduleWander(4000);
          this.scheduleThinking(20000);
          this.scheduleToss(70000);
        }
      });

      document.querySelectorAll('.demo-panel [data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
          const a = btn.dataset.action;
          if (a === 'companions-wake')         this.wakeUp();
          if (a === 'companions-angry')        this.makeAngry();
          if (a === 'companions-think')        this.forceThink();
          if (a === 'companions-konami')       this.triggerKonami();
          if (a === 'companions-mute-toggle')  this.toggleMute();
        });
      });

      // Accent / theme change — they treat it as magical weather
      this.watchAccent();

      // Keep characters inside the viewport when it resizes
      window.addEventListener('resize', () => {
        this.clampToViewport();
        this.positionBubble('craft');
        this.positionBubble('code');
      });

      // Start physics RAF loop
      this.lastFrameTime = performance.now();
      requestAnimationFrame(this.tick.bind(this));

      if (!this.muted) {
        // Tighter opening cadence — something happens in the first 15 s so
        // returning readers aren't greeted by motionless robots.
        this.scheduleIdle(10000);
        this.scheduleWander(3000);
        this.scheduleThinking(18000);
        this.scheduleToss(55000);
      }
    },

    clampToViewport() {
      const cw = this.containerWidth();
      this.BOT_IDS.forEach(who => {
        const p = this.pos[who];
        const pad = this.HITBOX[who];
        const minX = this.SIDE_M - pad.padL;
        const maxX = cw - this.SIDE_M - (this.S - pad.padR);
        const floor = this.floorYFor(who);
        if (p.x > maxX) p.x = Math.max(minX, maxX);
        if (p.x < minX) p.x = minX;
        if (p.y > floor) { p.y = floor; p.grounded = true; p.vy = 0; }
        this.applyPosition(who);
      });
    },

    applyPosition(who) {
      const p = this.pos[who];
      const el = this.els[who];
      el.style.left = p.x + 'px';
      el.style.top  = p.y + 'px';
      el.dataset.facing = p.facing;
    },

    // Squash and stretch effect for physical impacts
    applySquash(who, sx = 1.15, sy = 0.85, dur = 300) {
      const el = this.els[who];
      const sprite = el.querySelector('.sprite');
      if (!sprite) return;
      
      sprite.style.transition = 'none';
      sprite.style.transform = `scale(${sx}, ${sy})`;
      sprite.style.transformOrigin = 'bottom';
      
      // Force reflow
      sprite.offsetHeight;
      
      sprite.style.transition = `transform ${dur}ms cubic-bezier(0.175, 0.885, 0.32, 1.275)`;
      sprite.style.transform = '';
    },

    // ────────────────────────────────────────────────
    //  CLIP DRIVER (92-frame animations)
    //
    //  Each robot carries a `clip` object:
    //    { name, frames, fps, loop, i, t, holdLeft, done, onEnd? }
    //
    //  `playClip(who, name, opts?)` swaps the current clip and resets
    //  the frame-index accumulator. Legacy `setCharState` calls through
    //  STATE_TO_CLIP so old dialogue/physics still animates correctly.
    //
    //  `_advanceClip(p, dt)` is called from tick() for each bot. It
    //  accumulates `t` and steps `i` at the clip's FPS. On a non-looping
    //  clip it pauses on the last frame for `hold` ms, then falls back
    //  to idle (or a queued onEnd handler, e.g. `idea → think`).
    // ────────────────────────────────────────────────
    playClip(who, name, opts = {}) {
      let clip = CLIPS[name];
      if (!clip) {
        // Unknown clip name → safe fallback to idle. All specific poses
        // (e.g. a single-frame "chuckle" or "wipe_tear") are registered
        // in CLIPS with their own semantic names — authors never reference
        // raw FRAME_ORDER entries here. A missing `name` is treated as
        // a bug caller-side, but we never crash on it.
        name = 'idle';
        clip = CLIPS.idle;
      }
      // Owner-only clips fall back to idle on the wrong bot — prevents
      // CODE from playing `hammer_*` (which is idle-placeholder frames)
      // or CRAFT from playing `bar_*`. ANIMATIONS.md § 3.4 / § 8.
      if (clip.owner && clip.owner !== who) {
        name = 'idle'; clip = CLIPS.idle;
      }
      const p = this.pos[who];
      // Don't restart a clip that's already playing unless forced.
      if (!opts.force && p.clip && p.clip.name === name && !p.clip.done) return;
      p.clip = {
        name,
        frames: clip.frames,
        fps: clip.fps,
        loop: !!clip.loop,
        hold: clip.hold || 0,
        i: 0,
        t: 0,
        holdLeft: 0,
        done: false,
        onEnd: opts.onEnd || null,
      };
      // Render first frame immediately so there's no one-frame black gap.
      this._renderClipFrame(who);
    },

    _advanceClip(who, dt) {
      const p = this.pos[who];
      if (!p.clip) return;
      const c = p.clip;
      // Hold-at-end: non-looping clips pause on the last frame for `hold` ms.
      if (c.done && c.holdLeft > 0) {
        c.holdLeft -= dt * 1000;
        if (c.holdLeft <= 0) {
          const cb = c.onEnd;
          c.onEnd = null;
          if (cb) cb();
          // If the onEnd handler didn't swap clips, fall back to idle.
          else if (p.clip === c) this.playClip(who, 'idle');
        }
        return;
      }
      if (c.done) return;
      c.t += dt;
      const period = 1 / c.fps;
      while (c.t >= period) {
        c.t -= period;
        c.i++;
        if (c.i >= c.frames.length) {
          if (c.loop) { c.i = 0; }
          else {
            c.i = c.frames.length - 1;
            c.done = true;
            c.holdLeft = c.hold;
            // If no hold is configured, onEnd fires next tick.
            if (c.hold === 0) c.holdLeft = 16;
            break;
          }
        }
      }
      this._renderClipFrame(who);
    },

    _renderClipFrame(who) {
      const p = this.pos[who];
      if (!p.clip) return;
      const frameIdx = fIdx(p.clip.frames[p.clip.i]);
      // Only write if changed — avoids pointless style recalcs 60×/s.
      if (p._lastFrameIdx !== frameIdx) {
        this.els[who].style.setProperty('--cc-frame', String(frameIdx));
        p._lastFrameIdx = frameIdx;
      }
    },

    setCharState(who, state) {
      const p = this.pos[who];
      p.state = state;
      this.els[who].dataset.state = state;
      ['walking','talking','surprised','sleeping','typing','waving','excited',
       'idea','thinking','falling','dragging'].forEach(cls => {
        this.els[who].classList.toggle(cls, cls === state);
      });
      // Drive the clip driver too. Special-case: `idea` is a one-shot
      // that chains to `think`, matching the canonical brand macro
      // (bubble_sm → bubble_lg → flash → idea_a → idea_b → think_a↔b).
      const clipName = STATE_TO_CLIP[state] || 'idle';
      if (state === 'idea') {
        this.playClip(who, 'idea', {
          onEnd: () => {
            if (this.pos[who].state === 'idea' || this.pos[who].state === 'thinking') {
              this.playClip(who, 'think');
            }
          },
        });
      } else {
        this.playClip(who, clipName);
      }
    },

    // ────────────────────────────────────────────────
    //  Physics → animation bridge. Runs every tick after physics
    //  step, PROMOTES certain low-level motion states to richer
    //  clips without changing p.state (so dialogue/AI code that
    //  inspects `p.state === 'walking'` still works).
    //
    //  Priority ladder (higher wins):
    //    dragging  ─ tumble (flailing in air)
    //    hit-stars ─ hit clip (one-shot) — lockout 1.4s
    //    dizzy     ─ 3+ bumps/2s
    //    airborne  ─ jump_up (going up) / tumble (falling & thrown hard)
    //    walking   ─ walk cycle (driven by p.state === 'walking')
    //    talking   ─ talk (driven by p.state === 'talking')
    //    idle      ─ default (idle_a↔idle_b)
    //
    //  We don't fight the state machine — if a dialogue state is
    //  active (talking, typing, surprised, waving, excited, idea,
    //  thinking, sleeping) we leave it alone.
    // ────────────────────────────────────────────────
    _driveAnimationFromPhysics() {
      const now = performance.now();
      this.BOT_IDS.forEach(who => {
        const p = this.pos[who];
        // Keep dialogue/AI-driven states untouched.
        const dialogueStates = new Set(['talking','typing','surprised','waving',
          'excited','idea','thinking','sleeping']);
        if (dialogueStates.has(p.state)) return;

        // Physics clip-lock (e.g. hit/dizzy running) — let the clip finish.
        if (p.clipLockUntil && now < p.clipLockUntil) return;
        if (p.clipLockUntil) p.clipLockUntil = 0;

        // Dragging — show the `held` clip (surprised + gentle sway).
        // `tumble` is strictly for post-throw spinning, not pointer-grab.
        if (this.activeDrag && this.activeDrag.who === who) {
          if (!p.clip || p.clip.name !== 'held') this.playClip(who, 'held');
          return;
        }

        // Dizzy — 3+ bumps in last 2s.
        p.recentBumps = (p.recentBumps || []).filter(t => now - t < 2000);
        if (p.recentBumps.length >= 3 && p.grounded) {
          this.playClip(who, 'dizzy');
          p.clipLockUntil = now + 1800;  // ~9 frames of the 5-FPS dizzy loop
          p.recentBumps.length = 0;       // consume — don't retrigger instantly
          return;
        }

        // Airborne: distinguish going up (jump) from coming down fast (tumble).
        if (!p.grounded) {
          const fast = Math.hypot(p.vx, p.vy) > 240;
          if (p.vy < -40)           this.playClip(who, 'jump_up');
          else if (fast)            this.playClip(who, 'tumble');
          else                      this.playClip(who, 'jump_up');
          return;
        }

        // Grounded: walk if moving toward target, else idle.
        if (p.state === 'walking')  this.playClip(who, 'walk');
        else                        this.playClip(who, 'idle');
      });
    },

    // Called from collideWithObstacles + bot-bot + floor-hit.
    // Accumulates a bump timestamp on the *target* robot so dizzy
    // detection is per-robot, not global.
    recordBumpFor(who) {
      const p = this.pos[who];
      const now = performance.now();
      p.recentBumps = p.recentBumps || [];
      p.recentBumps.push(now);

      // Also track bumps at the sim layer (10-second window) to fire the
      // "bumped_repeated" scene once after 3 hits. Separate window from
      // the 2-s dizzy detection so the two don't compete.
      const sim = dialogue.sim;
      sim.bumpHistory[who] = sim.bumpHistory[who].filter(t => now - t < 10000);
      sim.bumpHistory[who].push(now);
      if (sim.bumpHistory[who].length >= 3) {
        dialogue.fire(`bumped_repeated:${who}`);
        dialogue.modifyMood(who, -15);
        sim.bumpHistory[who] = [];   // reset window after firing
      }
    },

    // Life-simulation accumulators — the heart of the "alive" feeling.
    //
    // Runs every physics tick. Cheap math (no AI, no pathfinding, no
    // state machine) — just four counters that evolve and occasionally
    // fire `dialogue.fire(tag)` when thresholds cross.
    //
    // Signals this emits:
    //   - 'morning' / 'evening'  — when workshopTime crosses phase boundary
    //   - 'chertyozh_7_tick'     — every ~60 s (picks a scene from the
    //                               long-running project arc)
    //   - 'silence_break'        — rare interrupt when curiosity > 99
    //   - 'stuck_together'       — bots within 50 px on floor for 3 s
    //   - 'platform_rest:<who>'  — bot on a platform for 10 s
    //   - 'partner_lost:<who>'   — bot dragged above the stage
    _simTick(dt) {
      const sim = dialogue.sim;

      // 1. Time of day: 8-minute cycle
      sim.workshopTime = (sim.workshopTime + dt / 480) % 1;

      // 2. Mood drift toward 50 (about 1 point per 2 s)
      this.BOT_IDS.forEach(who => {
        const diff = 50 - sim.mood[who];
        if (Math.abs(diff) > 0.1) {
          sim.mood[who] += Math.sign(diff) * (dt * 0.5);
        }
      });

      // 3. Curiosity — only climbs after 30 s of no interaction
      sim.idleTimer += dt;
      if (sim.idleTimer > 30) {
        sim.curiosity = Math.min(100, sim.curiosity + dt * 1.0);
      }
      // Rare interrupt at curiosity peak
      if (sim.curiosity >= 99 && Math.random() < 0.005) {
        sim.curiosity = 0;
        dialogue.fire('silence_break');
      }

      // 4. Time-of-day phase change → morning / evening scenes
      let phase = 'day';
      if (sim.workshopTime < 0.15) phase = 'morning';
      else if (sim.workshopTime > 0.85) phase = 'evening';
      if (sim.timePhase !== phase) {
        sim.timePhase = phase;
        if (phase === 'morning') dialogue.fire('morning');
        if (phase === 'evening') dialogue.fire('evening');
      }

      // 5. Chertyozh № 7 recurring tick every 60 s
      sim.chertyozhTimer += dt;
      if (sim.chertyozhTimer > 60) {
        sim.chertyozhTimer = 0;
        dialogue.fire('chertyozh_7_tick');
      }

      // 6. Pair proximity — "stuck_together" if within 50 px on ground for 3 s
      //    Also maintain `bots_close` flag (80 px window) for macro scenes
      //    that need to know the pair is physically close (e.g. handoff).
      const a = this.pos.craft, b = this.pos.code;
      const bothGrounded = a.grounded && b.grounded;
      const dx = Math.abs(a.x - b.x);
      const nearEachOther = dx < 50 && Math.abs(a.y - b.y) < 10;
      const idle = !this.activeDrag;
      if (bothGrounded && nearEachOther && idle) {
        sim.stuckTimer += dt;
        if (sim.stuckTimer > 3 && !sim.stuckFired) {
          dialogue.fire('stuck_together');
          sim.stuckFired = true;
        }
      } else {
        sim.stuckTimer = 0;
        sim.stuckFired = false;
      }
      // "bots_close" is a broader pair-proximity signal (80 px + grounded).
      // Scenes consult ctx.flags.bots_close instead of reaching into the
      // engine directly. Flag auto-expires in 2 s when bots drift apart.
      if (bothGrounded && dx < 80 && Math.abs(a.y - b.y) < 20) {
        dialogue.setFlag('bots_close', 1, 2);
      }

      // 7. Platform rest per bot — sitting on an elevated surface for 10 s
      this.BOT_IDS.forEach(who => {
        const p = this.pos[who];
        const floorY = this.floorYFor(who);
        const onElevated = p.grounded && (p.y < floorY - 10)
                           && !(this.activeDrag && this.activeDrag.who === who)
                           && Math.abs(p.vx) < 5;
        if (onElevated) {
          sim.platformTimer[who] += dt;
          if (sim.platformTimer[who] > 10 && !sim.platformFired[who]) {
            dialogue.fire(`platform_rest:${who}`);
            sim.platformFired[who] = true;
          }
        } else {
          sim.platformTimer[who] = 0;
          sim.platformFired[who] = false;
        }

        // 8. Partner lost — dragged above the top of the stage
        if (p.y < -150 && !sim.lostFired[who]) {
          dialogue.fire(`partner_lost:${who}`);
          sim.lostFired[who] = true;
        } else if (p.y > -20) {
          sim.lostFired[who] = false;
        }

        // 9. Staring at partner if idle/bored
        const pp = this.pos[this.partnerOf(who)];
        if (p.state === 'idle' && pp.state !== 'idle' && Math.random() < 0.015) {
           p.facing = p.x < pp.x ? 'right' : 'left';
           this.applyPosition(who);
        }

        // 10. Reset the "stack fired" latch when a bot comes back down
        //    to the main floor (ready for a new stack event).
        if (p.grounded && Math.abs(p.y - floorY) < 2) {
          sim.stackFired[who] = false;
        }

        // 11. Anti-stuck watchdog — if a bot sat in one spot for 15 s
        //     (grounded, idle, not being dragged), force a fresh nav pick.
        //     Without this a bot that wanders onto a platform + rolls 'stay'
        //     repeatedly can sit there forever, giving the "AI is dead" feel.
        if (!sim._idleSpot) sim._idleSpot = { craft: null, code: null };
        const spot = sim._idleSpot[who];
        const dragging = this.activeDrag && this.activeDrag.who === who;
        const idleOnGround = p.grounded && p.state === 'idle' && !dragging;
        if (idleOnGround) {
          if (!spot || Math.abs(spot.x - p.x) > 4 || Math.abs(spot.y - p.y) > 4) {
            sim._idleSpot[who] = { x: p.x, y: p.y, t: 0 };
          } else {
            spot.t += dt;
            if (spot.t > 15 && !this.muted &&
                this.dialogueState === 'idle') {
              spot.t = 0;
              // Force a wander pick (bypasses the scheduled cadence).
              this.wanderOne(who);
            }
          }
        } else {
          sim._idleSpot[who] = null;
        }
      });

      // 11. Inner monologue — tiny 1-3 word bubble every 15-40 s idle,
      //     20% chance, bypassing the SCENE pipeline (pure quickBubble).
      if (sim._innerMonoNext === undefined) {
        sim._innerMonoTimer = 0;
        sim._innerMonoNext  = 15 + Math.random() * 25;
      }
      sim._innerMonoTimer += dt;
      if (sim._innerMonoTimer >= sim._innerMonoNext) {
        sim._innerMonoTimer = 0;
        sim._innerMonoNext  = 15 + Math.random() * 25;
        const roll = Math.random();
        const dialogueIdle = this.dialogueState === 'idle';
        const botsQuiet    = this.pos.craft.grounded && this.pos.code.grounded && !this.activeDrag;
        if (roll < 0.20 && dialogueIdle && botsQuiet && !this.muted) {
          // Keep POOL as the RU source-of-truth / fallback; translations
          // are keyed `bot.monologue.<1-based idx>` in the dictionaries.
          const POOL = ['...hmm', 'почти готово', 'крч', 'lol', 'brb', 'zzz',
                        'o_O', 'wait what', 'ага', 'ок', '...', 'чёт', 'hm',
                        'meh', 'ну-ну'];
          const who  = Math.random() < 0.5 ? 'craft' : 'code';
          const idx  = Math.floor(Math.random() * POOL.length);
          const text = POOL[idx];
          try { this.quickBubble(who, text, 1500, `bot.monologue.${idx + 1}`); } catch (_) {}
        }
      }
    },

    // Play the hit reaction (hit_squash → stars → recover) on hard land.
    // Locks out physics-driven clips until the clip finishes.
    playHitReaction(who) {
      const p = this.pos[who];
      // Hit overrides dialogue states except sleeping (let them stay asleep).
      if (p.state === 'sleeping') return;
      this.playClip(who, 'hit', { force: true });
      p.clipLockUntil = performance.now() + 1400;
    },

    // ── Pointer drag + throw ──────────────────────
    onPointerDown(who, e) {
      if (this.muted) return;
      if (e.target.hasAttribute && e.target.hasAttribute('data-toggle-mute')) return;
      e.preventDefault();
      const el = this.els[who];
      try { el.setPointerCapture(e.pointerId); } catch (_) {}

      // ── User-interaction hooks (run BEFORE drag starts so a scene
      //    can fire from a pure click, not only after drag-threshold) ──
      const now = performance.now();
      const sim = dialogue.sim;
      // 1. "picked up after hurt" — if the bot took a recent hard hit
      //    and is now touched, thank the player for "stabilising vector".
      if (sim.bumpHistory[who] && sim.bumpHistory[who].length > 0) {
        const recent = sim.bumpHistory[who].filter(t => now - t < 3000);
        if (recent.length > 0) {
          dialogue.fire(`picked_up_after_hurt:${who}`);
          sim.bumpHistory[who] = [];  // consume so it doesn't spam
        }
      }
      // 2. "gentle touch" — a SINGLE click after >2 s of calm, before
      //    any drag begins. Click-streak starts at 1; if they spam, we
      //    treat it as regular interaction (no gentle-touch scene).
      const timeSinceLast = now - sim.lastClickAt[who];
      if (timeSinceLast < 300) {
        sim.clickStreak[who] += 1;
      } else {
        sim.clickStreak[who] = 1;
      }
      sim.lastClickAt[who] = now;
      if (timeSinceLast > 2000 && sim.clickStreak[who] === 1) {
        dialogue.modifyMood(who, +5);
        dialogue.fire(`gentle_touch:${who}`);
      }
      // 3. Mark interaction — curiosity resets, idleTimer restarts
      dialogue.resetInteraction();

      // All drag math happens in .companions container coords, not viewport.
      // Viewport deltas == container deltas, so velocity calc is unaffected.
      const local = this._toLocal(e.clientX, e.clientY);
      const rect = el.getBoundingClientRect();
      const elLocal = this._toLocal(rect.left, rect.top);
      this.activeDrag = {
        who,
        pointerId: e.pointerId,
        startX: local.x,
        startY: local.y,
        offsetX: local.x - elLocal.x,
        offsetY: local.y - elLocal.y,
        history: [{ x: local.x, y: local.y, t: performance.now() }],
      };
      this.pointerMoved = false;
    },

    onPointerMove(e) {
      if (!this.activeDrag || e.pointerId !== this.activeDrag.pointerId) return;
      const d = this.activeDrag;
      const local = this._toLocal(e.clientX, e.clientY);
      // Upgrade to "drag" once pointer moved > 4 px
      if (!this.pointerMoved &&
          Math.hypot(local.x - d.startX, local.y - d.startY) > 4) {
        this.pointerMoved = true;
        const p = this.pos[d.who];
        p.vx = 0; p.vy = 0; p.grounded = false; p.walkTarget = null;
        this.setCharState(d.who, 'dragging');
        this.reactGrab(d.who);
        // "Partner sees me lifted" — quick reaction from the other bot.
        // Fires only once per drag (guard via activeDrag flag).
        if (!d._partnerNotified) {
          d._partnerNotified = true;
          dialogue.fire(`partner_dragged:${d.who}`);
        }
      }
      if (this.pointerMoved) {
        const p = this.pos[d.who];
        p.x = local.x - d.offsetX;
        p.y = local.y - d.offsetY;
        this.applyPosition(d.who);
        // Re-clamp the bubble as the dragged bot moves. Without this the
        // bubble was "sticky" to its starting position relative to the
        // viewport edge, so dragging a talking bot toward a wall pushed
        // the bubble into / past the stage edge.
        this.positionBubble(d.who);
        d.history.push({ x: local.x, y: local.y, t: performance.now() });
        const cutoff = performance.now() - 80;
        while (d.history.length > 3 && d.history[0].t < cutoff) d.history.shift();
      }
    },

    _toLocal(clientX, clientY) {
      // `.companions` is a child of `.cc-stage-camera`, which applies a
      // translate+scale transform. getBoundingClientRect() returns the
      // visually-transformed rect; `clientX - r.left` is therefore in
      // visual pixels. Physics stores p.x/p.y in world pixels (untransformed
      // container space), so we must divide by the camera scale to get
      // world coordinates. The scale is published by bot.camera.ts on the
      // `.cc-stage-camera` dataset. Falls back to `width / offsetWidth`
      // (which equals the effective scale) and finally to 1.
      const c = this.els.container;
      const r = c.getBoundingClientRect();
      const cam = document.querySelector('.cc-stage-camera');
      let s = 1;
      if (cam && cam.dataset.ccCamScale) {
        const n = parseFloat(cam.dataset.ccCamScale);
        if (n > 0) s = n;
      } else if (c.offsetWidth > 0 && r.width > 0) {
        s = r.width / c.offsetWidth;
      }
      return { x: (clientX - r.left) / s, y: (clientY - r.top) / s };
    },

    onPointerUp(e) {
      if (!this.activeDrag || e.pointerId !== this.activeDrag.pointerId) return;
      const d = this.activeDrag;
      const p = this.pos[d.who];
      if (!this.pointerMoved) {
        // Treat as click
        this.activeDrag = null;
        this.onClick(d.who);
        return;
      }
      // Compute release velocity from recent history
      let vx = 0, vy = 0;
      if (d.history.length >= 2) {
        const first = d.history[0];
        const last  = d.history[d.history.length - 1];
        const dt = Math.max(0.016, (last.t - first.t) / 1000);
        vx = Math.max(-this.MAX_V, Math.min(this.MAX_V, (last.x - first.x) / dt));
        vy = Math.max(-this.MAX_V, Math.min(this.MAX_V, (last.y - first.y) / dt));
        // Cap upward launch velocity — prevents the "rocket into the ceiling"
        // feel on aggressive flicks. Downward is left uncapped by MAX_V only,
        // since slamming a bot into the floor hard is intended behavior.
        if (vy < 0) vy = Math.max(-this.MAX_THROW_VY, vy);
      }
      p.vx = vx; p.vy = vy;
      p.grounded = false;
      this.setCharState(d.who, 'falling');
      this.activeDrag = null;
      const speed = Math.hypot(vx, vy);
      if (speed > 400) {
        this.reactThrow(d.who);
        dialogue.modifyMood(d.who, -10);  // stress from being flung
      } else {
        this.reactSetdown(d.who);
        dialogue.modifyMood(d.who, +3);   // gently placed → tiny mood lift
      }

      // ── Reconciliation check ──
      // If the player gently placed the bot (low speed) very close to
      // the partner on the floor, they interpret the "anomaly" as being
      // drawn together. Fires only on soft releases at low vy so throws
      // that happen to land near a partner don't hijack the moment.
      if (speed < 200) {
        const partner = this.partnerOf(d.who);
        if (!partner) return;
        const pp = this.pos[partner];
        const dist = Math.abs(p.x - pp.x);
        if (dist < 60 && pp.grounded && Math.abs(p.y - pp.y) < 40) {
          // Defer briefly so the setdown scene plays first, then reconcile.
          setTimeout(() => {
            if (this.dialogueState !== 'talking') {
              dialogue.modifyMood('craft', +8);
              dialogue.modifyMood('code',  +8);
              dialogue.fire('reconciliation');
            }
          }, 900);
        }
      }
    },

    // ── Pathfinding awareness (lightweight) ────────────────────
    // Describes what the bot's feet are touching right now. Returns:
    //   { type: 'floor'|'platform', id?, edgeLeft, edgeRight, top }
    // `edgeLeft`/`edgeRight` are the walkable x-extents of the surface,
    // measured at the bot's sprite.x (i.e. already accounting for the
    // half-sprite offsets on each end). `top` is the y-value p.y would
    // have while grounded on this surface.
    getCurrentSurface(who) {
      const p = this.pos[who];
      const ch = this.els.container ? this.els.container.clientHeight : 480;
      const floorTop = ch - this.FLOOR_M - this.FOOT_Y[who];
      const pad = this.HITBOX[who];

      // Platform check first (more specific). Uses same tolerance/overlap
      // test as _isUnsupported so the two helpers stay in lockstep.
      if (this._obstacles && this._obstacles.length) {
        const feetY = p.y + this.FOOT_Y[who];
        const tol = Math.max(this.PLATFORM_M, 2) + 1;
        const hb = this._hb(who);
        for (const o of this._obstacles) {
          const target = o.y - this.PLATFORM_M;
          if (feetY < target - tol || feetY > target + tol) continue;
          if (hb.right <= o.x || o.x + o.w <= hb.left) continue;
          return {
            type: 'platform',
            id: o.el && (o.el.id || o.el.getAttribute('data-ob') || null),
            ob: o,
            // Walkable sprite.x so the HITBOX stays fully above the platform.
            edgeLeft:  o.x - (this.S - pad.padR),
            edgeRight: (o.x + o.w) - pad.padL,
            top: o.y - this.PLATFORM_M - this.FOOT_Y[who],
          };
        }
      }

      // Main floor — edges are the viewport clamp used by walk code.
      const cw = this.containerWidth();
      return {
        type: 'floor',
        id: null,
        ob: null,
        edgeLeft:  this.SIDE_M - pad.padL,
        edgeRight: cw - this.SIDE_M - (this.S - pad.padR),
        top: floorTop,
      };
    },

    // Plan a jump from (x0, y0) to land on a target surface at (tx, ty).
    // `flightTime` ≈ 0.8 s gives a readable arc under current GRAVITY/drag.
    // Returns { vx, vy, feasible } — feasible=false when the horizontal
    // speed would exceed MAX_V (e.g. platform on the far side of the stage).
    planJumpTo(x0, y0, tx, ty, flightTime = 0.8) {
      const g = this.GRAVITY;
      const dx = tx - x0;
      const dy = ty - y0;                                  // usually negative (up)
      const vx = dx / flightTime;
      const vy = (dy - 0.5 * g * flightTime * flightTime) / flightTime;
      const feasible = Math.abs(vx) < 520 && vy > -1400;
      return { vx, vy, feasible };
    },

    // List all non-current surfaces and whether we can hop onto them from
    // the current spot. Cheap ballistic check only (air-drag ignored — it's
    // ~1.5 % per tick and the formula already produces slightly over-vx).
    reachablePlatforms(who) {
      const p = this.pos[who];
      const current = this.getCurrentSurface(who);
      const out = [];
      if (!this._obstacles) return out;
      for (const o of this._obstacles) {
        if (current.ob === o) continue;
        // Target sprite.x: centre of the platform (half-sprite offset).
        const targetX = o.x + o.w / 2 - this.S / 2;
        const targetY = o.y - this.PLATFORM_M - this.FOOT_Y[who];
        const plan = this.planJumpTo(p.x, p.y, targetX, targetY);
        if (plan.feasible) out.push({ ob: o, targetX, targetY, plan });
      }
      return out;
    },

    // High-level move set the wander picker draws from. Returns array of
    //   { kind, weight, ...payload }
    // where `kind` ∈ walk-left, walk-right, step-off-left, step-off-right,
    //               jump-to-platform, jump-up, stay
    getNavOptions(who) {
      const p = this.pos[who];
      const surface = this.getCurrentSurface(who);
      const opts = [];

      // Walk targets: stay on current surface.
      const room = 80;
      if (p.x - surface.edgeLeft > room) {
        opts.push({ kind: 'walk-left',
          walkTo: Math.max(surface.edgeLeft,
                           p.x - (80 + Math.random() * 160)),
          weight: 1 });
      }
      if (surface.edgeRight - p.x > room) {
        opts.push({ kind: 'walk-right',
          walkTo: Math.min(surface.edgeRight,
                           p.x + (80 + Math.random() * 160)),
          weight: 1 });
      }

      // Step-off from platform edges — walk off so gravity takes us down.
      if (surface.type === 'platform') {
        opts.push({ kind: 'step-off-left',
          walkTo: surface.edgeLeft - 24, weight: 1 });
        opts.push({ kind: 'step-off-right',
          walkTo: surface.edgeRight + 24, weight: 1 });
      }

      // Jump to any reachable platform (excluding the one we're already on).
      const reach = this.reachablePlatforms(who);
      for (const r of reach) {
        opts.push({ kind: 'jump-to-platform',
          target: r, weight: 1 });
      }

      // Stand-still idle.
      opts.push({ kind: 'stay', weight: 1 });

      // Up-hop when we have nothing else meaningful to do.
      opts.push({ kind: 'jump-up', weight: 1 });

      return { surface, opts };
    },

    // Weighted-random pick per the spec:
    //   on platform → 30% walk, 40% step-off, 20% jump-to-other, 10% stay
    //   on floor    → 50% walk, 30% jump-to-platform, 20% stay
    _pickNavOption(who) {
      const { surface, opts } = this.getNavOptions(who);
      const bucket = (o) => {
        if (o.kind === 'walk-left' || o.kind === 'walk-right')       return 'walk';
        if (o.kind === 'step-off-left' || o.kind === 'step-off-right') return 'step';
        if (o.kind === 'jump-to-platform') return 'jump';
        if (o.kind === 'jump-up')          return 'hop';
        return 'stay';
      };
      const weights = surface.type === 'platform'
        ? { walk: 0.30, step: 0.40, jump: 0.20, stay: 0.10, hop: 0.02 }
        : { walk: 0.50, step: 0.00, jump: 0.30, stay: 0.20, hop: 0.05 };
      // Expand opts with category weight; drop categories with no options.
      const weighted = opts.map(o => ({ o, w: weights[bucket(o)] || 0 }))
                           .filter(x => x.w > 0);
      if (!weighted.length) return opts[opts.length - 1];   // "stay"
      const total = weighted.reduce((a, b) => a + b.w, 0);
      let r = Math.random() * total;
      for (const x of weighted) { r -= x.w; if (r <= 0) return x.o; }
      return weighted[weighted.length - 1].o;
    },

    // ── Walk & Jump (bottom-only) ────────────────────────
    wanderOne(who) {
      if (this.muted) return;
      const p = this.pos[who];
      if (p.state !== 'idle' || !p.grounded) return;

      const partner = this.partnerOf(who);
      const pp = partner ? this.pos[partner] : null;
      const dist = pp ? Math.abs(p.x - pp.x) : 0;

      // 1. Social drive (kept from legacy) — override AI if partner is far.
      if (pp && dist > 450 && Math.random() < 0.3) {
        const maxX = this.containerWidth() - this.SIDE_M - this.S;
        const nudge = (Math.random() * 60 - 30);
        p.walkTarget = Math.max(this.SIDE_M, Math.min(maxX, pp.x + nudge));
        p.facing = p.walkTarget > p.x ? 'right' : 'left';
        p._sprint = Math.random() < 0.4;
        this.setCharState(who, 'walking');
        return;
      }

      // 2. Occasional high-altitude "scanning" animation (kept from legacy).
      const surface = this.getCurrentSurface(who);
      if (surface.type === 'platform' && Math.random() < 0.12) {
        this.playClip(who, 'think');
        this.setCharState(who, 'scanning');
        setTimeout(() => {
          if (this.pos[who].state === 'scanning') this.setCharState(who, 'idle');
        }, 2500);
        return;
      }

      // 3. Weighted nav pick — drives the actual movement variety.
      const opt = this._pickNavOption(who);
      this._executeNavOption(who, opt);
    },

    // Execute a plan from _pickNavOption. Kept separate so anti-stuck
    // rescue logic can force-call it too.
    _executeNavOption(who, opt) {
      const p = this.pos[who];
      if (!opt) return;
      switch (opt.kind) {
        case 'walk-left':
        case 'walk-right': {
          p.walkTarget = opt.walkTo;
          p.facing = p.walkTarget > p.x ? 'right' : 'left';
          p._sprint = Math.random() < 0.25;
          this.setCharState(who, 'walking');
          break;
        }
        case 'step-off-left':
        case 'step-off-right': {
          // Walk past the edge; the tick loop's _isUnsupported check will
          // un-ground us as soon as hitbox-x clears the platform.
          p.walkTarget = opt.walkTo;
          p.facing = p.walkTarget > p.x ? 'right' : 'left';
          p._sprint = false;
          this.setCharState(who, 'walking');
          // Flag so we know a deliberate hop is intended if we get stuck.
          p._pendingHop = true;
          break;
        }
        case 'jump-to-platform': {
          const { vx, vy } = opt.target.plan;
          p.grounded = false;
          p.vx = vx;
          p.vy = vy;
          p.facing = vx > 0 ? 'right' : 'left';
          this.setCharState(who, 'falling');
          this.emitDustAtFeet(who);
          if (Math.random() < 0.3) dialogue.fire('jump:' + who);
          break;
        }
        case 'jump-up': {
          p.grounded = false;
          p.vy = -650 - Math.random() * 300;
          p.vx = (Math.random() > 0.5 ? 1 : -1) * (80 + Math.random() * 120);
          this.setCharState(who, 'falling');
          this.emitDustAtFeet(who);
          if (Math.random() < 0.3) dialogue.fire('jump:' + who);
          break;
        }
        case 'stay':
        default:
          // Do nothing — next wander tick will re-roll.
          break;
      }
    },

    // Imperative walk with a callback on arrival. Used by the toss action
    // (attacker walks up to victim, then throws).  Setting `sprint: true`
    // multiplies walk speed so cross-stage dashes don't take forever.
    walkTo(who, targetX, { sprint = false, onArrive = null } = {}) {
      const p = this.pos[who];
      const maxX = this.containerWidth() - this.SIDE_M - this.S;
      p.walkTarget = Math.max(this.SIDE_M, Math.min(maxX, targetX));
      p.facing = p.walkTarget > p.x ? 'right' : 'left';
      p._sprint = sprint;
      p._onArrive = onArrive;
      this.setCharState(who, 'walking');
    },

    scheduleWander(delay) {
      clearTimeout(this.wanderTimer);
      if (this.muted) return;
      // Tighter wander cadence — idle stillness was the #1 "dead" feeling.
      const d = delay !== undefined ? delay : 2500 + Math.random() * 5000;
      this.wanderTimer = setTimeout(() => {
        if (this.dialogueState === 'idle') {
          const who = Math.random() < 0.5 ? 'craft' : 'code';
          // Wait 20% of the time, jump or walk 80%
          if (Math.random() < 0.8) this.wanderOne(who);
        }
        this.scheduleWander();
      }, d);
    },

    // ── thinking-sequence (macro-state): Claude-style idle → "OH!" → sit & type → idle
    // Fires only when the character is genuinely idle; otherwise reschedules.
    scheduleThinking(delay) {
      clearTimeout(this.thinkingTimer);
      if (this.muted) return;
      const d = delay !== undefined ? delay : 30000 + Math.random() * 40000;
      this.thinkingTimer = setTimeout(() => {
        const who = Math.random() < 0.5 ? 'craft' : 'code';
        const p = this.pos[who];
        const otherState = this.pos[this.partnerOf(who)].state;
        const canThink =
          !this.muted &&
          this.dialogueState === 'idle' &&
          p.state === 'idle' &&
          p.grounded &&
          otherState !== 'talking';
        if (canThink) this.runThinkingSequence(who);
        this.scheduleThinking();
      }, d);
    },

    // ── TOSS macro — dialogue that ends in one robot physically tossing
    // the other. A full scene plays first (intro), then actionToss fires:
    // attacker sprints up to the victim and launches them into the air.
    scheduleToss(delay) {
      clearTimeout(this.tossTimer);
      if (this.muted) return;
      // 80-170 s — rare enough to stay a gag, frequent enough to catch.
      const d = delay !== undefined ? delay : 80000 + Math.random() * 90000;
      this.tossTimer = setTimeout(() => {
        if (this.canToss()) {
          const attacker = Math.random() < 0.5 ? 'craft' : 'code';
          const victim   = attacker === 'craft' ? 'code' : 'craft';
          this.startTossScene(attacker, victim);
        }
        this.scheduleToss();
      }, d);
    },

    canToss() {
      return !this.muted &&
             this.dialogueState === 'idle' &&
             this.pos.craft.grounded && this.pos.code.grounded &&
             this.pos.craft.state === 'idle' && this.pos.code.state === 'idle' &&
             !this.activeDrag;
    },

    // Plays an argumentative intro, then (on scene end) fires actionToss.
    startTossScene(attacker, victim) {
      const scene = dialogue.pick(`toss_intro:${attacker}`);
      if (!scene) return;
      const lines = dialogue.play(scene);
      this.pendingAction = { type: 'toss', attacker, victim };
      this.playSequence(lines);
    },

    // Actual physical toss: attacker sprints to victim, winds up, launches.
    actionToss(attacker, victim) {
      const va = this.pos[attacker];
      const vv = this.pos[victim];
      if (!va.grounded || !vv.grounded) return;
      // Stand ~34 px to the near side of the victim
      const approach = vv.x + (va.x < vv.x ? -34 : +34);
      this.walkTo(attacker, approach, {
        sprint: true,
        onArrive: () => {
          va.facing = vv.x > va.x ? 'right' : 'left';
          this.applyPosition(attacker);
          // Wind-up pose
          this.setCharState(attacker, 'excited');
          setTimeout(() => {
            // LAUNCH: slight horizontal kick AWAY from attacker, big upward vy
            vv.grounded = false;
            const dir = vv.x > va.x ? 1 : -1;
            vv.vx = dir * (240 + Math.random() * 140);
            vv.vy = -1250 - Math.random() * 350;
            this.setCharState(victim, 'falling');
            dialogue.recordEvent('throw', victim);
            // Attacker's gag line + return to idle
            this.setCharState(attacker, 'idle');
            this.reactFromScene(`toss_shout:${attacker}`, attacker, 1500);
            // Victim yells while airborne (reuse existing throw pool)
            setTimeout(() => this.reactFromScene(`throw:${victim}`, victim, 1600), 220);
          }, 360);
        },
      });
    },

    runThinkingSequence(who) {
      // claude-code.gif-inspired macro:
      //   1) idea   — antenna grows (idea_a ↔ idea_b), ~900ms
      //   2) thinking — squat + laptop typing (think_a ↔ think_b), ~3s
      //   3) idle
      this.setCharState(who, 'idea');

      setTimeout(() => {
        if (this.pos[who].state !== 'idea') return;  // interrupted (click, wander, etc.)
        this.setCharState(who, 'thinking');

        if (Math.random() < 0.65 && this.dialogueState === 'idle') {
          const scene = dialogue.pick(`insight:${who}`);
          if (scene) {
            const line = dialogue.play(scene)[0];
            if (line) this.quickBubble(who, line.text, 2400);
          }
        }

        setTimeout(() => {
          if (this.pos[who].state === 'thinking') this.setCharState(who, 'idle');
        }, 3000);
      }, 900);
    },

    // Measure obstacle AABBs relative to the companions container.
    // Called lazily on first tick (container might not have laid out yet
    // on init) and refreshed on resize.
    refreshObstacles() {
      const c = this.els.container;
      if (!c) { this._obstacles = []; return; }
      // IMPORTANT: physics runs in the untransformed "world" coordinate
      // space of `.companions` (bots are positioned via `style.top/left`
      // and compared against `clientHeight`, neither of which is affected
      // by the CSS transform applied to `.cc-stage-camera`). Reading
      // `getBoundingClientRect()` here would return SCALED coordinates
      // (scale × world) the moment the camera zooms, so obstacle AABBs
      // would drift away from the bots visually. Use `offsetLeft/Top/
      // Width/Height` — these are layout-space values that ignore the
      // ancestor transform. Dynamic-movement offsets added later in the
      // tick loop are expressed in the same world space, so this stays
      // consistent through zoom changes.
      this._obstacles = [...c.querySelectorAll('[data-ob]')].map((el) => {
        const isDynamic = el.hasAttribute('data-dynamic');
        const base = {
          el,
          origX: el.offsetLeft,
          origY: el.offsetTop,
          w: el.offsetWidth,
          h: el.offsetHeight,
          isDynamic,
          moveType: el.getAttribute('data-dynamic'),
          tOffset: el.__tOffset || (el.__tOffset = Math.random() * 100)
        };
        base.x = base.origX;
        base.y = base.origY;
        return base;
      });

      // Special interactive elements
      const btn = document.getElementById('cc-floor-btn');
      if (btn) {
         this._btn = {
            el: btn,
            x: btn.offsetLeft,
            y: btn.offsetTop,
            w: btn.offsetWidth,
            h: btn.offsetHeight,
            pressed: false
         };
      }
    },

    // Resolve an AABB vs AABB overlap by pushing the bot out along the
    // axis of least penetration and reflecting velocity on that axis.
    // Uses the per-bot hitbox (tight silhouette), NOT the 48×48 sprite
    // box — so transparent sprite padding never counts as "collision."
    // Returns true if a bump happened; also emits emote + spark.
    collideWithObstacles(p, who) {
      if (!this._obstacles || !this._obstacles.length) return false;
      const hb  = this._hb(who);
      const pad = this.HITBOX[who];
      let bumped = false;
      for (const o of this._obstacles) {
        // Tight AABB vs obstacle AABB
        if (hb.right  <= o.x         || o.x + o.w <= hb.left) continue;
        if (hb.bottom <= o.y         || o.y + o.h <= hb.top)  continue;

        const right  = hb.right  - o.x;          // push-out left
        const left   = (o.x + o.w) - hb.left;    // push-out right
        const bottom = hb.bottom - o.y;          // push-out top (landing)
        const top    = (o.y + o.h) - hb.top;     // push-out bottom (ceiling)
        const min = Math.min(right, left, bottom, top);
        const speedBefore = Math.hypot(p.vx, p.vy);

        if      (min === right)  {
          // Push hitbox.right to o.x → sprite.x = o.x - (S - padR)
          p.x = o.x - (this.S - pad.padR);
          p.vx = -Math.abs(p.vx) * this.BOUNCE;
        } else if (min === left) {
          // Push hitbox.left to o.x+o.w → sprite.x = o.x+o.w - padL
          p.x = (o.x + o.w) - pad.padL;
          p.vx =  Math.abs(p.vx) * this.BOUNCE;
        } else if (min === bottom) {
          // Landed on top of a platform — feet snap `PLATFORM_M` px above
          // its surface so the legs remain visible (mirrors the FLOOR_M
          // gap used for the main floor). The support-check downstream
          // allows this small clearance (threshold 2 px) — actually we
          // also widen that threshold below.
          p.y = o.y - this.FOOT_Y[who] - this.PLATFORM_M;
          const impactVy = p.vy;
          p.vy = 0;
          p.vx *= this.FRICTION;
          if (!p.grounded && impactVy > 260) this.reactLand(who, impactVy > 900 ? 'hard' : 'soft');
          p.grounded = true;
        } else {
          // Hit from below (bot flying up into platform bottom).
          // sprite.y = o.y+o.h - padT so hitbox.top = o.y+o.h.
          p.y = (o.y + o.h) - pad.padT;
          p.vy =  Math.abs(p.vy) * this.BOUNCE;
        }
        bumped = true;
        this.recordBumpFor(who);

        // Audible bump only when fast enough to make the sound funny.
        if (speedBefore > 140) {
          this.spark(p.x + this.S / 2, p.y + this.S / 2);
          if (Math.random() < 0.65 && who) this.emoteOnBump(who);
        }
      }
      return bumped;
    },

    // Elastic-ish bot-vs-bot collision: push apart, swap and dampen vx.
    // Bumps HUD counter also updates here.
    collideBotVsBot() {
      const a = this.pos.craft, b = this.pos.code;
      const ha = this._hb('craft');
      const hb = this._hb('code');
      // Tight-silhouette AABB test — no ghost collisions on transparent corners.
      if (ha.right  <= hb.left || hb.right  <= ha.left) return false;
      if (ha.bottom <= hb.top  || hb.bottom <= ha.top)  return false;

      // Phantom rule: when BOTH are grounded AND neither is being dragged,
      // they walk through each other. Physics re-engages the moment
      // either lifts off (throw, jump, drag).
      if (a.grounded && b.grounded && !this.activeDrag) return false;

      const draggedWho = this.activeDrag ? this.activeDrag.who : null;
      const aStatic = a.grounded || draggedWho === 'craft';
      const bStatic = b.grounded || draggedWho === 'code';
      if (aStatic && bStatic) return false;

      // Penetration depths along each axis.
      const dxCenter = (hb.left + hb.w / 2) - (ha.left + ha.w / 2);
      const dyCenter = (hb.top  + hb.h / 2) - (ha.top  + ha.h / 2);
      const overlapX = (ha.w + hb.w) / 2 - Math.abs(dxCenter);
      const overlapY = (ha.h + hb.h) / 2 - Math.abs(dyCenter);
      const axisX    = overlapX < overlapY;  // lesser overlap = collision axis

      // Restitution coefficients for "bubble ball" feel.
      const R_SIDE = 0.85;   // side-on hit — bouncy
      const R_TOP  = 0.55;   // top-down hit — damped (less cartoon-y)

      if (axisX) {
        // ── SIDE-ON COLLISION (horizontal axis dominant) ──────────
        // User-requested physics: the flyer transfers most of its
        // momentum into the target (which lifts off), and decelerates
        // to near-zero. Implemented as a 1D elastic swap with restitution.
        const dir = dxCenter >= 0 ? 1 : -1;

        if (aStatic) {
          // b flew into grounded/static a. Transfer b's vx into a.
          // a gets kicked off the ground; b nearly stops.
          const bvx = b.vx;
          a.vx = bvx * R_SIDE;
          a.grounded = false;
          a.y -= 1;                                // nudge up so floor-snap doesn't fire next frame
          b.vx = bvx * (1 - R_SIDE);               // small residual, preserves direction
          b.x += dir * overlapX;                   // separate
        } else if (bStatic) {
          const avx = a.vx;
          b.vx = avx * R_SIDE;
          b.grounded = false;
          b.y -= 1;
          a.vx = avx * (1 - R_SIDE);
          a.x -= dir * overlapX;
        } else {
          // Both airborne — classic elastic-swap, equal push apart.
          // This is the "two bubbles bouncing off each other" case.
          a.x -= dir * overlapX / 2;
          b.x += dir * overlapX / 2;
          const tmp = a.vx;
          a.vx = b.vx * R_SIDE;
          b.vx = tmp  * R_SIDE;
          // Minor vy kick so they diverge vertically too (prevents sticking)
          a.vy -= 30;
          b.vy -= 30;
        }
      } else {
        // ── TOP-DOWN COLLISION (vertical axis dominant) ───────────
        // User's request: distinguish two outcomes —
        //   1) SOFT landing (low |vy|) → stand on the other bot's head,
        //      treat partner as a moving platform. Can walk off later.
        //   2) HARD impact (high |vy|)  → bounce off (the old behaviour).
        // SOFT_LAND_VY is the threshold — tuned so a gentle fall rests
        // on the head while a thrown-from-across-the-stage hit bounces.
        const SOFT_LAND_VY = 520;     // px/s — below this = rest on head
        const dir = dyCenter >= 0 ? 1 : -1;   // +1 ⇒ b below a; -1 ⇒ a below b

        // Helper: snap `faller` to stand on `platform` bot's head.
        // Feet land on the platform bot's measured `HEAD_TOP` —
        // the actual visible head pixel row, discovered by pixel-scan
        // at init time. Falls back to sprite.top (HEAD_TOP=0) if the
        // scan hasn't resolved yet (image still decoding on first load).
        // Each faller uses its own FOOT_Y so bots with different
        // heights stack naturally.
        const standOn = (faller, platform, fallerWho, platformWho) => {
          const headSurfaceY = platform.y + (this.HEAD_TOP[platformWho] || 0);
          faller.y = headSurfaceY - this.FOOT_Y[fallerWho];
          faller.vy = 0;
          faller.vx *= 0.3;   // preserves a little slide if still moving
          faller.grounded = true;
          // Fire stack reactions once per landing. The latch is cleared
          // in _simTick when the faller returns to the main floor.
          const sim = dialogue.sim;
          if (!sim.stackFired[fallerWho]) {
            sim.stackFired[fallerWho] = true;
            // Defer so the physics settles first; also avoids firing if
            // the engine is mid-dialogue.
            setTimeout(() => {
              dialogue.fire(`stack:top:${fallerWho}`);
              // Tiny delay so the two scenes don't overlap
              setTimeout(() => dialogue.fire(`stack:bottom:${platformWho}`), 800);
            }, 250);
          }
        };

        // Ownership: a = craft, b = code. Use correct bot-name when
        // calling standOn so the faller's own FOOT_Y is applied.
        if (aStatic) {
          // craft (a) is the grounded platform; code (b) is the faller.
          // code must be ABOVE craft for this branch: dyCenter = b - a < 0
          // means b higher than a, but that's code above craft with craft
          // lower in world coords. Our dir = +1 here means b below a, -1
          // means b above a — so landing-on-head needs dir === -1.
          if (dir === -1 && b.vy > 0 && b.vy < SOFT_LAND_VY) {
            standOn(b, a, 'code', 'craft');   // code lands on craft's head
          } else {
            b.y += dir * overlapY;
            b.vy = -b.vy * R_TOP;
            b.vy += dir * 30;
          }
        } else if (bStatic) {
          // code (b) is grounded platform; craft (a) is faller.
          if (dir === 1 && a.vy > 0 && a.vy < SOFT_LAND_VY) {
            standOn(a, b, 'craft', 'code');   // craft lands on code's head
          } else {
            a.y -= dir * overlapY;
            a.vy = -a.vy * R_TOP;
            a.vy -= dir * 30;
          }
        } else {
          // Both airborne on vertical collision — damped elastic swap.
          a.y -= dir * overlapY / 2;
          b.y += dir * overlapY / 2;
          const tmpy = a.vy;
          a.vy = b.vy * R_TOP;
          b.vy = tmpy  * R_TOP;
        }
      }
      return true;
    },

    incrementBumps() {
      this._bumps = (this._bumps || 0) + 1;
      const hud = document.getElementById('hud-bumps');
      if (hud) hud.textContent = this._bumps;
    },

    // Emote bubble — small "ow!" / "hey!" that floats up and fades.
    // x, y are local (container-relative) coords. Returns the element.
    emote(x, y, text) {
      const c = this.els.container;
      if (!c) return null;
      const el = document.createElement('div');
      el.className = 'cc-emote';
      el.textContent = text;
      el.style.left = x + 'px';
      el.style.top  = y + 'px';
      c.appendChild(el);
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 1300);
      return el;
    },
    // Quick spark at impact point.
    spark(x, y) {
      const c = this.els.container;
      if (!c) return;
      const el = document.createElement('div');
      el.className = 'cc-spark';
      el.style.left = x + 'px';
      el.style.top  = y + 'px';
      c.appendChild(el);
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 450);
    },

    BUMP_EMOTES: ['ой!', 'оуч!', 'эй!', '!!', '?!', 'куда!', '*тыдыщ*'],
    // GLOBAL emote cooldown. Earlier per-bot cooldown still allowed
    // both craft + code to produce emotes simultaneously (on bot-bot
    // collisions, where emoteOnBump is called for BOTH bots). The user
    // still saw stacked emotes ("куда!" above "эй!") — so now only ONE
    // emote can be on screen at a time, regardless of source.
    _lastEmoteAt: 0,
    EMOTE_COOLDOWN_MS: 1500,
    emoteOnBump(who) {
      const now = performance.now();
      if (now - this._lastEmoteAt < this.EMOTE_COOLDOWN_MS) return;
      this._lastEmoteAt = now;
      // Drop ALL still-visible emotes anywhere in the DOM. Belt-and-suspenders
      // against any other code path (setdown, throw shout, etc) that might
      // have spawned a .cc-emote that's still fading out.
      document.querySelectorAll('.cc-emote').forEach(el => el.remove());
      const p = this.pos[who];
      const text = this.BUMP_EMOTES[Math.floor(Math.random() * this.BUMP_EMOTES.length)];
      this.emote(p.x + this.S / 2, p.y, text);
    },

    // Physics tick: gravity when airborne, walk toward target when grounded.
    tick(now) {
      const dt = Math.min(0.04, (now - this.lastFrameTime) / 1000);
      this.lastFrameTime = now;

      // Animation clip advance (independent of physics outcomes below —
      // runs every frame so a tumble still spins while dragged, a walk
      // still animates while moving, etc.)
      this._advanceClip('craft', dt);
      this._advanceClip('code',  dt);

      // Life-simulation accumulators + spatial/temporal hooks
      // (workshopTime, mood drift, curiosity, morning/evening, chertyozh
      // timer, stuck_together, platform_rest, partner_lost)
      this._simTick(dt);

      // Derived physics-level animations that override dialogue/idle
      // until the condition resolves. Evaluated after the physics step
      // writes p.vx/vy so we see this frame's velocity.
      this._driveAnimationFromPhysics();

      // Lazy-init obstacle AABBs on first tick (or after resize).
      if (!this._obstacles || this._obstaclesDirty) {
        this.refreshObstacles();
        this._obstaclesDirty = false;
      }
      
      // Move dynamic obstacles & entities on them
      if (this._obstacles) {
        this._obstacles.forEach(o => {
          if (o.isDynamic) {
            const t = now / 1000 + o.tOffset;
            const prevX = o.x;
            const prevY = o.y;

            if (o.moveType === 'hover') {
              o.y = o.origY + Math.sin(t * 2) * 20; // Up/down
            } else if (o.moveType === 'slide') {
              o.x = o.origX + Math.sin(t * 1.5) * 50; // Left/right
            }

            const dx = o.x - prevX;
            const dy = o.y - prevY;
            o.el.style.transform = `translate(${o.x - o.origX}px, ${o.y - o.origY}px)`;

            // Ride moving platforms
            this.BOT_IDS.forEach(who => {
              const p = this.pos[who];
              if (p.grounded && (!this.activeDrag || this.activeDrag.who !== who)) {
                const hb = this._hb(who);
                const feetY = p.y + this.FOOT_Y[who];
                const tol = Math.max(this.PLATFORM_M, 2) + 1;
                // Base target on prevY so we catch them before platform shifts mathematically
                const oldTarget = prevY - this.PLATFORM_M;
                if (Math.abs(feetY - oldTarget) <= tol && hb.right > prevX && hb.left < prevX + o.w) {
                  p.x += dx;
                  p.y += dy;
                  this.applyPosition(who);
                }
              }
            });
          }
        });
      }

      const cw = this.containerWidth();
      
      let buttonPressedNow = false;
      let presser = null;

      this.BOT_IDS.forEach(who => {
        const p = this.pos[who];
        const hb = this._hb(who);

        // Check if standing on or overlapping the button
        if (this._btn) {
           const feetY = p.y + this.FOOT_Y[who];
           if (feetY >= this._btn.y - 10 && feetY <= this._btn.y + this._btn.h + 10 &&
               hb.right > this._btn.x && hb.left < this._btn.x + this._btn.w) {
              buttonPressedNow = true;
              presser = who;
           }
        }
        
        // Stuck detection
        if (p.state === 'walking' && p.walkTarget !== null && p.grounded) {
          if (p._lastX === undefined) p._lastX = p.x;
          if (Math.abs(p.x - p._lastX) < 1) {
            p._stuckFrames = (p._stuckFrames || 0) + 1;
            if (p._stuckFrames > 30) {
              // Stuck for 30 frames (~0.5s), do a frustrated jump
              p.grounded = false;
              p.vy = -800;
              p.vx = (p.facing === 'right' ? -1 : 1) * 200; // Jump back
              p.walkTarget = null;
              p._sprint = false;
              this.setCharState(who, 'falling');
              this.emitDustAtFeet(who);
              dialogue.fire('stuck_jump:' + who);
              p._stuckFrames = 0;
            }
          } else {
            p._stuckFrames = 0;
          }
          p._lastX = p.x;
        } else {
          p._stuckFrames = 0;
        }

        // The one being actively dragged is positioned by onPointerMove
        if (this.activeDrag && this.activeDrag.who === who) return;

        const pad = this.HITBOX[who];
        // Hitbox-aware viewport limits for this bot.
        // sprite.x is clamped so hitbox.left >= SIDE_M and hitbox.right <= cw - SIDE_M.
        const minX = this.SIDE_M - pad.padL;
        const maxX = cw - this.SIDE_M - (this.S - pad.padR);
        const floor = this.floorYFor(who);

        if (!p.grounded) {
          p.vy += this.GRAVITY * dt;
          // Air-drag: small per-tick velocity damping. Smooths the otherwise
          // linear ballistic arc into something that reads as "air resistance",
          // giving throws a softer parabolic feel. Scaled by dt so it's
          // frame-rate-independent (at 60fps these approximate 0.985 / 0.992).
          const dragX = Math.pow(this.AIR_DRAG_X, dt * 60);
          const dragY = Math.pow(this.AIR_DRAG_Y, dt * 60);
          p.vx *= dragX;
          p.vy *= dragY;
          p.x  += p.vx * dt;
          p.y  += p.vy * dt;
          if (Math.abs(p.vx) > 20) p.facing = p.vx > 0 ? 'right' : 'left';
          // Toroidal horizontal world — bot flying off the left edge
          // reappears on the right and vice versa. Uses the FULL container
          // width (not the SIDE_M-padded walkable range) so the wrap is
          // invisible: the sprite smoothly disappears past one edge while
          // the mirrored copy slides in on the other. Dragged bot is
          // already excluded earlier in this branch via the pointer
          // position, so no drag clamp to worry about here.
          if (p.x < -this.S)       { p.x += cw + this.S; p._wrappedAt = performance.now(); }
          else if (p.x > cw)       { p.x -= cw + this.S; p._wrappedAt = performance.now(); }
          // Ceiling: hitbox.top must stay >= 0. sprite.y = -padT would put
          // hitbox.top at 0. Bounce off the ceiling when reached.
          if (p.y < -pad.padT) { p.y = -pad.padT; p.vy = Math.abs(p.vy) * this.BOUNCE; }
          // Obstacles — may also land on top (sets grounded)
          if (this.collideWithObstacles(p, who)) this.incrementBumps();
          // Floor hit
          if (p.y >= floor) {
            p.y = floor;
            const impactVy = p.vy;
            p.grounded = true; p.vy = 0;
            p.vx *= this.FRICTION;
            this.setCharState(who, 'idle');
            if (impactVy > 900)       this.reactLand(who, 'hard');
            else if (impactVy > 260)  this.reactLand(who, 'soft');
          }
          this.applyPosition(who);
          return;
        }

        // Grounded support check: is there actually a floor or platform
        // still under this bot's feet? If the bot walked off a platform
        // edge, or got pushed off by a collision, this frame will catch
        // it and hand control back to the airborne branch (gravity, walls,
        // obstacle collision, land detection all re-engage automatically).
        //
        // Support = hitbox feet within 2 px of the main floor, OR within
        // 2 px of a platform's top AND the hitbox x-range overlaps the
        // platform. Otherwise the bot is floating — unground it.
        if (this._isUnsupported(who)) {
          p.grounded = false;
          if (p.walkTarget !== null) { p.walkTarget = null; p._sprint = false; }
          // Small nudge down so gravity picks it up immediately.
          p.vy = Math.max(p.vy, 40);
          return;
        }

        // Grounded: walk toward walkTarget if set
        if (p.state === 'walking' && p.walkTarget !== null) {
          const dir = p.walkTarget > p.x ? 1 : -1;
          const step = (p._sprint ? this.WALK_SPEED * 2.5 : this.WALK_SPEED) * dt;
          const arrive = () => {
            p.walkTarget = null;
            p._sprint = false;
            const cb = p._onArrive; p._onArrive = null;
            this.setCharState(who, 'idle');
            if (cb) cb();
          };
          if (Math.abs(p.walkTarget - p.x) < step) {
            p.x = p.walkTarget; arrive();
          } else {
            p.x += step * dir;
            p.facing = dir > 0 ? 'right' : 'left';
            if (p.x < minX) { p.x = minX; arrive(); }
            if (p.x > maxX) { p.x = maxX; arrive(); }
          }
          // Walking bots still collide with obstacles side-on
          if (this.collideWithObstacles(p, who)) {
            this.incrementBumps();
            // Got stuck on obstacle -> jump over it instead of pushing
            p.walkTarget = null;
            p._sprint = false;
            if (p.grounded) {
              p.grounded = false;
              p.vy = -750; // Jump up
              p.vx = (p.facing === 'right' ? 1 : -1) * 150; // Keep moving forward over the block
              this.setCharState(who, 'falling');
              this.emitDustAtFeet(who);
              if (Math.random() < 0.5) dialogue.fire('jump_over:' + who);
            } else {
              this.setCharState(who, 'idle'); 
            }
          }
          this.applyPosition(who);
        }
      });

      // Bot-bot collision — after both have moved for this frame
      if (this.collideBotVsBot()) {
        this.incrementBumps();
        this.recordBumpFor('craft');
        this.recordBumpFor('code');
        this.applyPosition('craft');
        this.applyPosition('code');
        // Spark between them, then each emotes its own reaction
        const a = this.pos.craft, b = this.pos.code;
        const midX = (a.x + b.x + this.S) / 2;
        const midY = (a.y + b.y + this.S) / 2;
        this.spark(midX, midY);
        if (Math.random() < 0.7) this.emoteOnBump('craft');
        if (Math.random() < 0.7) this.emoteOnBump('code');
      }

      // Handle button logic
      if (this._btn) {
         if (buttonPressedNow && !this._btn.pressed) {
            this._btn.pressed = true;
            this._btn.el.style.transform = 'translateY(5px)';
            this._btn.el.style.background = '#ffd966';
            this.emitEffect('shock', this._btn.x + this._btn.w / 2, this._btn.y);
            dialogue.fire('button_pressed:' + presser);
            // Flash random background color of the stage
            const stage = document.querySelector('.cc-stage');
            if (stage) {
               stage.style.backgroundColor = `hsl(${Math.random() * 360}, 50%, 15%)`;
               setTimeout(() => {
                  stage.style.backgroundColor = '';
               }, 800);
            }
         } else if (!buttonPressedNow && this._btn.pressed) {
            this._btn.pressed = false;
            this._btn.el.style.transform = 'translateY(0)';
            this._btn.el.style.background = 'var(--accent)';
         }
      }

      requestAnimationFrame(this.tick.bind(this));
    },

    // ── Accent change watcher ─────────────────────
    watchAccent() {
      const getAccent = () =>
        getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      let last = getAccent();
      const check = () => {
        const now = getAccent();
        if (now && now !== last) {
          last = now;
          if (!this.muted) this.reactAccent();
        }
      };
      try {
        const obs = new MutationObserver(check);
        obs.observe(document.documentElement, { attributes: true });
        obs.observe(document.body,            { attributes: true });
      } catch (_) {}
      setInterval(check, 1200);  // fallback for CSS-var changes that don't mutate attrs
    },

    // ── FX emission (dust, sparkle, shock) ──────────────
    emitEffect(type, x, y, opts = {}) {
      const layer = document.querySelector('.fx-layer');
      if (!layer) return;
      const el = document.createElement('div');
      el.className = 'fx-' + type + (opts.big ? ' big' : '');
      if (type === 'sparkle') {
        el.textContent = '*';
        el.style.setProperty('--dx', (opts.dx || 0) + 'px');
        el.style.setProperty('--dy', (opts.dy || -20) + 'px');
      }
      el.style.left = x + 'px';
      el.style.top  = y + 'px';
      layer.appendChild(el);
      // Remove when animation ends (or after 1.5s fallback)
      const kill = () => { if (el.parentNode) el.parentNode.removeChild(el); };
      el.addEventListener('animationend', kill, { once: true });
      setTimeout(kill, 1500);
    },

    // Bursts a fan of sparkles at a point (useful for waving/excited).
    emitSparkleBurst(x, y, count = 4) {
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2) * (i / count) + Math.random() * 0.8;
        const dist = 18 + Math.random() * 14;
        this.emitEffect('sparkle', x, y, {
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist - 10,
        });
      }
    },

    // Dust at the FEET of the companion. .fx-dust has transform-origin:
    // bottom-center, so we align the element's BOTTOM edge with the
    // character's floor-line. Element is 10 px tall → top = bottom - 10.
    // Y anchor is the ACTUAL feet pixel (FOOT_Y), not sprite-box bottom —
    // the sprite's legs don't reach p.y + S because of transparent padding.
    //
    // X centering: the element is positioned by its TOP-LEFT corner, so to
    // visually center it under the sprite we subtract HALF the element's
    // natural CSS width. Normal dust = 30px (half = 15), big dust = 46px
    // (half = 23). Previously both used -15 which skewed `big` to the right.
    emitDustAtFeet(who, big) {
      const p = this.pos[who];
      const feetY = p.y + this.FOOT_Y[who];
      const spriteCenterX = p.x + this.S / 2;       // center of 48px sprite box
      const dustW = big ? 46 : 30;                   // matches .fx-dust / .fx-dust.big
      const dustH = big ? 14 : 10;
      // x = sprite_center - dust_width/2  |  y = feet_line - dust_height
      this.emitEffect('dust', spriteCenterX - dustW / 2, feetY - dustH, { big });
    },

    // Shock ring centred exactly on the floor line under the feet.
    // .fx-shock has `transform: translate(-50%, -50%)` in CSS so the element's
    // visual center aligns to (left, top). We pass the sprite's feet-center.
    emitShockAtFeet(who) {
      const p = this.pos[who];
      const feetY = p.y + this.FOOT_Y[who];
      this.emitEffect('shock', p.x + this.S / 2, feetY - 2);
    },

    // Shake only the .companions container, and only if it's on screen.
    // This prevents the page layout from jittering when a character crashes
    // while the reader is scrolled far from the bottom of the doc.
    screenShake() {
      const c = this.els.container;
      if (!c) return;
      const r = c.getBoundingClientRect();
      const inView = r.bottom > 0 && r.top < window.innerHeight;
      if (!inView) return;
      c.classList.remove('fx-shake');
      void c.offsetWidth;    // re-trigger animation
      c.classList.add('fx-shake');
      setTimeout(() => c.classList.remove('fx-shake'), 300);
    },

    // ── Quick reaction helpers ──────────────────────────
    // Optional 4th arg `i18nKey` lets callers request a translated string
    // (inner-monologue pool, reactFromScene single-liners, etc).
    quickBubble(who, text, holdMs, i18nKey) {
      const bubble = this.bubbles[who];
      const shown = i18nKey ? dialogue._i18nText(i18nKey, text) : text;
      while (bubble.firstChild) bubble.removeChild(bubble.firstChild);
      const whoEl = document.createElement('span');
      whoEl.className = 'who'; whoEl.textContent = who + ':';
      const textEl = document.createElement('span');
      textEl.className = 'text'; textEl.textContent = shown;
      bubble.appendChild(whoEl); bubble.appendChild(textEl);
      bubble.classList.add('visible');
      this.positionBubble(who);
      // Track as active so langchange can re-render the text node.
      this._activeBubble = { who, key: i18nKey || null, fallback: text };
      clearTimeout(bubble._hideTimer);
      bubble._hideTimer = setTimeout(() => {
        bubble.classList.remove('visible');
        if (this._activeBubble && this._activeBubble.who === who) this._activeBubble = null;
      }, holdMs);
    },

    // Keep a visible bubble inside the STAGE (not the viewport). The
    // playground is a fixed-height 1080-max-width box inside the page,
    // so clamping against `innerWidth` lets bubbles extend past the
    // stage's own border. We clamp against `.cc-stage` (or the
    // `.companions` container if the stage isn't present — e.g. tests).
    //
    // Writes `--bubble-x` + `--bubble-y`; the CSS ::after tail negates
    // them so the tail still points at the companion. Re-called on
    // every typewriter char because the bubble grows as text is added.
    positionBubble(who) {
      const bubble = this.bubbles[who];
      if (!bubble || !bubble.classList.contains('visible')) return;
      // During screen-wrap (toroidal world jump) the bubble would be
      // torn across the stage — hide it briefly so the visual pop is
      // invisible. 300 ms covers the moment the bot re-enters from
      // the other edge.
      const wrappedAt = this.pos[who]?._wrappedAt;
      if (wrappedAt && performance.now() - wrappedAt < 300) {
        bubble.style.opacity = '0';
        return;
      }
      if (bubble.style.opacity === '0') bubble.style.opacity = '';
      // Reset prior shift so the measurement below reflects "natural"
      // position — otherwise we'd chase our own tail when text grows.
      bubble.style.setProperty('--bubble-x', '0px');
      bubble.style.setProperty('--bubble-y', '0px');

      const stage = document.getElementById('cc-stage')
                   || this.els.container;
      if (!stage) return;
      const sr = stage.getBoundingClientRect();
      const br = bubble.getBoundingClientRect();
      const pad = 8;
      let sx = 0, sy = 0;

      // Horizontal clamp — bubble's own box must stay inside stage.
      if (br.left < sr.left + pad) {
        sx = (sr.left + pad) - br.left;
      } else if (br.right > sr.right - pad) {
        sx = (sr.right - pad) - br.right;
      }

      // Vertical clamp — if the bubble would poke above the stage top
      // (e.g. a long line grows tall while the bot is near the ceiling),
      // slide it down. We don't clamp the bottom because the bubble
      // sits ABOVE the bot and can never extend below the stage.
      if (br.top < sr.top + pad) {
        sy = (sr.top + pad) - br.top;
      }

      if (sx !== 0) bubble.style.setProperty('--bubble-x', `${sx}px`);
      if (sy !== 0) bubble.style.setProperty('--bubble-y', `${sy}px`);
    },

    // Play a single-line reaction via the scene engine.
    // For who-agnostic tags (grab:X, throw:X, land_*:X, setdown:X), lines
    // are templated with 'craft' and get remapped to the actual `who`.
    // For partner_on_X scenes, the scene already names the correct speaker
    // (e.g. {who:'code'} in partner_on_throw:craft) — SKIP remap.
    reactFromScene(tag, remapWho, holdMs) {
      const scene = dialogue.pick(tag);
      if (!scene) return false;
      const rawLines = dialogue.play(scene);
      const lines = tag.startsWith('partner_on_')
        ? rawLines
        : dialogue.resolveLines(rawLines, remapWho);
      const line = lines[0];
      if (!line) return false;
      this.quickBubble(line.who, line.text, holdMs || 1400, line._key);
      if (line.act)  this.applyLineAct(line.who, line.act, 650);
      if (line.clip) this.applyLineClip(line.who, line.clip, 900);
      return true;
    },

    // Apply a short-lived animation state for a single line.
    applyLineAct(who, act, durationMs) {
      const p = this.pos[who];
      if (!p.grounded) return;
      const prev = p.state;
      this.setCharState(who, act);
      // FX hook: sparkle on wave/excited
      if (act === 'wave' || act === 'excited') {
        const rect = this.els[who].getBoundingClientRect();
        this.emitSparkleBurst(rect.left + rect.width / 2, rect.top + 8, 4);
      }
      setTimeout(() => {
        if (this.pos[who].state === act) this.setCharState(who, prev === act ? 'idle' : prev);
      }, durationMs);
    },

    // Play a one-shot CLIPS[name] animation tied to a single dialogue line.
    // Unlike line.act, a clip DOESN'T change p.state (so scene gating and
    // physics predicates are unaffected). Clips are purely visual and
    // auto-expire back to whatever the physics/state layer wants next.
    //
    // Owner-only clips (CRAFT.hammer, CODE.bar) play correctly on the
    // right bot and are no-ops on the wrong bot (idle fallback in playClip).
    applyLineClip(who, clipName, durationMs) {
      const p = this.pos[who];
      if (!p.grounded) return;
      this.playClip(who, clipName);
      // Lock out the physics-driven clip promotion briefly so the scene
      // clip actually has time to read on screen.
      p.clipLockUntil = performance.now() + (durationMs || 900);
    },

    // When A does something, B may react with a one-liner from 'partner_on_X:A'.
    maybePartnerReact(event, who, delay = 450) {
      const other = this.partnerOf(who);
      if (!this.pos[other].grounded) return;
      if (this.dialogueState === 'talking') return;
      setTimeout(() => {
        if (this.pos[other].grounded && this.pos[other].state === 'idle' &&
            this.dialogueState === 'idle') {
          this.reactFromScene(`partner_on_${event}:${who}`, other, 1400);
        }
      }, delay);
    },

    reactGrab(who) {
      dialogue.recordEvent('grab', who);
      this.reactFromScene(`grab:${who}`, who, 1400);
    },
    reactThrow(who) {
      dialogue.recordEvent('throw', who);
      this.reactFromScene(`throw:${who}`, who, 1500);
      this.maybePartnerReact('throw', who, 650);
    },
    reactLand(who, kind) {
      // Dust puff and maybe shock ring at feet
      this.emitDustAtFeet(who, kind === 'hard');
      
      // Apply physical squash on landing
      if (kind === 'hard') {
        this.applySquash(who, 1.25, 0.75, 400);
        this.emitShockAtFeet(who);
        this.screenShake();
      } else {
        this.applySquash(who, 1.1, 0.9, 200);
      }
      // Every landing counts toward the "dizzy if 3+ in 2s" tally.
      this.recordBumpFor(who);
      dialogue.recordEvent(kind === 'hard' ? 'land_hard' : 'land_soft', who);
      this.reactFromScene(`land_${kind}:${who}`, who, 1400);
      if (kind === 'hard') {
        // `hit` clip: hit_squash → hit_stars (loop) → hit_recover.
        // Locks out physics-driven clips until it finishes (~1.4s).
        this.playHitReaction(who);
        this.setCharState(who, 'surprised');
        setTimeout(() => {
          if (this.pos[who].state === 'surprised') this.setCharState(who, 'idle');
        }, 700);
        // Partner dialogue scene (not just bubble) after a crash
        this.maybePartnerLandScene(who, 1000);
        // Partner watches the crash and reacts — `laugh` if rapport is
        // high (they're teasing), `facepalm` if rapport is low (annoyed).
        // Uses the clip system directly so the partner animates even if
        // no dialogue scene is picked for them.
        const partner = this.partnerOf(who);
        setTimeout(() => {
          const pp = this.pos[partner];
          if (!pp.grounded) return;
          if (pp.state !== 'idle' && pp.state !== 'walking') return;
          const r = dialogue.rapport;
          const clip = r >= 55 ? 'laugh' : 'facepalm';
          this.playClip(partner, clip);
          this.pos[partner].clipLockUntil = performance.now() + 1800;
        }, 450);
      }
    },
    reactSetdown(who) {
      this.reactFromScene(`setdown:${who}`, who, 1200);
    },
    reactAccent() {
      if (this.dialogueState === 'talking') return;
      if (!this.pos.craft.grounded || !this.pos.code.grounded) return;
      dialogue.recordEvent('accent_change');
      const scene = dialogue.pick('accent');
      if (!scene) return;
      clearTimeout(this.idleTimer);
      this.playSequence(dialogue.play(scene));
    },

    // Partner reacts to a crash with a full dialogue scene (not just a bubble).
    maybePartnerLandScene(who, delay) {
      const other = this.partnerOf(who);
      setTimeout(() => {
        if (this.muted) return;
        if (this.dialogueState === 'talking') return;
        if (!this.pos[other].grounded || !this.pos[who].grounded) return;
        const scene = dialogue.pick(`partner_on_land_hard:${who}`);
        if (scene) {
          clearTimeout(this.idleTimer);
          this.playSequence(dialogue.play(scene));
        }
      }, delay);
    },

    // ── dialogue ──────────────────────────────────
    scheduleIdle(delay) {
      clearTimeout(this.idleTimer);
      if (this.muted) return;
      // Much shorter than before (was 90-150 s) — they chatter often so the
      // stage doesn't feel dead between macro events.
      const d = delay !== undefined ? delay : 22000 + Math.random() * 28000;
      this.idleTimer = setTimeout(() => this.startIdle(), d);
    },

    startIdle() {
      if (this.muted || this.dialogueState !== 'idle') return;
      if (!this.pos.craft.grounded || !this.pos.code.grounded) return;
      // ~20% chance: pick from 'behavior' tier (scripted mini-routine).
      // Falls back to a normal idle scene if no behavior candidates fit.
      let scene = null;
      if (Math.random() < 0.20) {
        scene = dialogue.pick('behavior');
      }
      if (!scene) scene = dialogue.pick('idle');
      if (!scene) return;
      dialogue.recordEvent('idle_play');
      this.playSequence(dialogue.play(scene), scene);
    },

    playSequence(seq, scene) {
      this.dialogueState = 'talking';
      this.queue = [...seq];
      // If the caller passed a behavior scene, kick off its action executor
      // in parallel with the dialogue lines. Actions run async and are
      // best-effort — they don't block or interrupt the typewriter.
      if (scene && typeof scene.id === 'string' && scene.id.startsWith('behavior.')) {
        try { this._runBehaviorAction(scene.id); } catch (_) {}
      }
      this.playNext();
    },

    // Minimal behavior-action executor. Maps scene id → short physics
    // routine that plays alongside the dialogue lines. Uses existing
    // engine primitives (walkTarget, setCharState, playClip, floorYFor,
    // containerWidth). Unknown ids are no-ops.
    _runBehaviorAction(id) {
      const cw = this.containerWidth();
      const sideM = this.SIDE_M;
      const S = this.S;
      const maxX = cw - sideM - S;
      const clampX = (x) => Math.max(sideM, Math.min(maxX, x));
      const craft = this.pos.craft;
      const code  = this.pos.code;
      const walkTo = (who, tx) => {
        const p = this.pos[who];
        if (!p.grounded) return;
        p.walkTarget = clampX(tx);
        p.facing = p.walkTarget > p.x ? 'right' : 'left';
        this.setCharState(who, 'walking');
      };

      switch (id) {
        case 'behavior.chase': {
          // CRAFT walks to CODE, then CODE retreats ~120px away.
          walkTo('craft', code.x - 30);
          setTimeout(() => {
            if (this.dialogueState !== 'talking') return;
            const dir = code.x > craft.x ? 1 : -1;
            walkTo('code', code.x + dir * 120);
          }, 900);
          break;
        }
        case 'behavior.ball_toss': {
          // CODE windup+release, pause, CRAFT hifive approach+slap.
          // Also spawn a visual ball that arcs between them.
          try { this.playClip('code', 'throwAct', { force: true }); } catch (_) {}
          this._spawnBallArc(code, craft);
          setTimeout(() => {
            try { this.playClip('craft', 'hifive', { force: true }); } catch (_) {}
          }, 600);
          break;
        }
        case 'behavior.highfive': {
          // Both walk to middle, then both play hifive clip.
          const mid = (craft.x + code.x) / 2;
          walkTo('craft', mid - 24);
          walkTo('code',  mid + 24);
          setTimeout(() => {
            try { this.playClip('craft', 'hifive', { force: true }); } catch (_) {}
            try { this.playClip('code',  'hifive', { force: true }); } catch (_) {}
          }, 800);
          break;
        }
        case 'behavior.sync_nap': {
          // Both sit+sleep for ~3s.
          try { this.playClip('craft', 'rest', { force: true }); } catch (_) {}
          try { this.playClip('code',  'rest', { force: true }); } catch (_) {}
          setTimeout(() => {
            try { this.playClip('craft', 'sleep', { force: true }); } catch (_) {}
            try { this.playClip('code',  'sleep', { force: true }); } catch (_) {}
          }, 700);
          setTimeout(() => {
            // Return to idle after ~3s total
            try { this.playClip('craft', 'idle'); } catch (_) {}
            try { this.playClip('code',  'idle'); } catch (_) {}
          }, 3500);
          break;
        }
        case 'behavior.stuck_corner': {
          // Teleport CRAFT to right edge + play tumble (cycling).
          craft.x = maxX;
          craft.walkTarget = null;
          this.applyPosition('craft');
          try { this.playClip('craft', 'tumble', { force: true }); } catch (_) {}
          setTimeout(() => {
            try { this.playClip('craft', 'idle'); } catch (_) {}
          }, 2200);
          break;
        }
        case 'behavior.race': {
          // Both dash to opposite edges.
          walkTo('craft', sideM + 10);
          walkTo('code',  maxX - 10);
          break;
        }
        case 'behavior.dance_battle': {
          try { this.playClip('craft', 'wave', { force: true }); } catch (_) {}
          setTimeout(() => {
            try { this.playClip('code', 'wave', { force: true }); } catch (_) {}
          }, 400);
          break;
        }
        default:
          // no-op for other behavior.* scenes (dialog-only)
          break;
      }
    },

    // Spawn a short-lived DOM element that arcs from one bot to the other.
    // Purely decorative; added to `.companions` so the camera tracking
    // covers it. Removed after the animation ends.
    _spawnBallArc(from, to) {
      try {
        const host = this.els.container;
        if (!host) return;
        const ball = document.createElement('div');
        ball.className = 'cc-event-ball';
        ball.setAttribute('data-cc-event', 'ball_toss');
        ball.setAttribute('data-dynamic', 'appear');
        ball.style.position = 'absolute';
        ball.style.left = `${from.x + this.S / 2 - 8}px`;
        ball.style.top  = `${from.y + 4}px`;
        ball.style.width = '16px';
        ball.style.height = '16px';
        ball.style.borderRadius = '50%';
        ball.style.background = 'radial-gradient(circle at 35% 30%, #fff, var(--accent-2, #ffcf3f) 60%, #b8870b 100%)';
        ball.style.boxShadow = '0 0 10px color-mix(in oklab, var(--accent-2, #ffcf3f) 70%, transparent)';
        ball.style.pointerEvents = 'none';
        ball.style.zIndex = '6';
        ball.style.transition = 'left 700ms cubic-bezier(.2,.8,.5,1), top 700ms cubic-bezier(.4,0,.6,1)';
        host.appendChild(ball);
        // Kick transition on next frame.
        requestAnimationFrame(() => {
          ball.style.left = `${to.x + this.S / 2 - 8}px`;
          ball.style.top  = `${to.y - 40}px`;
          requestAnimationFrame(() => {
            ball.style.top = `${to.y + 4}px`;
          });
        });
        setTimeout(() => { try { ball.remove(); } catch (_) {} }, 1200);
      } catch (_) {}
    },

    playNext() {
      if (!this.queue.length) {
        this.dialogueState = 'idle';
        // If a scene queued up an after-action (like a toss), run it now.
        if (this.pendingAction) {
          const a = this.pendingAction;
          this.pendingAction = null;
          if (a.type === 'toss') {
            // Short beat so the last line finishes clearing before action fires
            setTimeout(() => this.actionToss(a.attacker, a.victim), 300);
          }
        }
        this.scheduleIdle();
        return;
      }
      const line = this.queue.shift();
      this.showBubble(line.who, line.text, () => {
        setTimeout(() => this.playNext(), 650);
      }, line);                          // pass the full line so showBubble can read .act/.hold
    },

    // line object shape: { who, text, act?, hold?, _key? }
    showBubble(who, text, onDone, line) {
      const bubble = this.bubbles[who];
      const otherWho = this.partnerOf(who);
      const other = this.bubbles[otherWho];
      other.classList.remove('visible');
      if (this.pos[otherWho].state === 'talking') this.setCharState(otherWho, 'idle');

      // ── i18n ── Resolve display text via window.__i18n if line has a key.
      // `text` arg may be the raw RU; we prefer a translated string when
      // available for the current language.
      const i18nKey = line && line._key;
      if (i18nKey) {
        text = dialogue._i18nText(i18nKey, text);
      }
      // Track the active bubble so langchange can re-render it mid-typewriter.
      this._activeBubble = { who, key: i18nKey || null, fallback: line ? line.text : text };

      while (bubble.firstChild) bubble.removeChild(bubble.firstChild);
      const whoEl = document.createElement('span');
      whoEl.className = 'who';
      whoEl.textContent = who + ':';
      const textEl = document.createElement('span');
      textEl.className = 'text';
      bubble.appendChild(whoEl);
      bubble.appendChild(textEl);

      bubble.classList.add('visible');
      this.positionBubble(who);
      // Face toward listener (only when grounded — don't override airborne state)
      const mine = this.pos[who];
      const their = this.pos[otherWho];
      mine.facing = their.x > mine.x ? 'right' : 'left';
      this.applyPosition(who);

      // Line.act / line.clip take precedence: if set, go into that state
      // for the line duration. Otherwise go into 'talking' as usual.
      const act  = line && line.act;
      const clip = line && line.clip;
      if (mine.grounded) {
        if (act) {
          this.setCharState(who, act);
          // Sparkle FX for wave/excited at head
          if (act === 'wave' || act === 'excited') {
            const rect = this.els[who].getBoundingClientRect();
            this.emitSparkleBurst(rect.left + rect.width / 2, rect.top + 8, 4);
          }
        } else if (mine.state === 'idle') {
          this.setCharState(who, 'talking');
        }
        // line.clip is purely visual and stacks on top of whatever state
        // was just set — lets scenes play e.g. `hammer` or `bar` or
        // `laugh` without fighting the talk-state machine.
        if (clip) {
          this.playClip(who, clip);
          mine.clipLockUntil = performance.now() + Math.max(900, text.length * 45);
        }
      }

      let i = 0;
      const type = () => {
        if (i >= text.length) {
          // Restore idle after the typewriter finishes (but only if we changed state)
          if (mine.grounded && (mine.state === 'talking' || mine.state === act)) {
            this.setCharState(who, 'idle');
          }
          const holdMs = (line && line.hold) || 1600 + text.length * 30;
          setTimeout(() => {
            bubble.classList.remove('visible');
            onDone();
          }, holdMs);
          return;
        }
        textEl.textContent += text[i++];
        this.positionBubble(who);            // re-fit as text grows
        setTimeout(type, 42 + Math.random() * 28);
      };
      setTimeout(type, 130);
    },

    onClick(who) {
      if (this.muted) return;
      if (this.dialogueState === 'talking') return;
      if (!this.pos[who].grounded) return;      // ignore clicks while airborne

      this.clickCounts[who] = (this.clickCounts[who] || 0) + 1;
      clearTimeout(this.idleTimer);

      const responses = DIALOGUES[`click_${who}`];
      const idx = Math.min(this.clickCounts[who] - 1, responses.length - 1);
      const text = responses[idx];

      if (this.clickCounts[who] >= 5) {
        this.setCharState(who, 'surprised');
        setTimeout(() => {
          if (this.pos[who].state === 'surprised') this.setCharState(who, 'idle');
        }, 900);
      }

      this.playSequence([{ who, text }]);

      clearTimeout(this.clickResetTimer);
      this.clickResetTimer = setTimeout(() => { this.clickCounts[who] = 0; }, 5000);
    },

    triggerKonami() {
      if (this.muted) return;
      if (!this.pos.craft.grounded || !this.pos.code.grounded) return;
      clearTimeout(this.idleTimer);
      this.setCharState('craft', 'waving');
      this.setCharState('code',  'waving');
      const k = dialogue.pick('konami');
      if (k) this.playSequence(dialogue.play(k));
      setTimeout(() => {
        if (this.pos.craft.state === 'waving') this.setCharState('craft', 'idle');
        if (this.pos.code.state  === 'waving') this.setCharState('code',  'idle');
      }, 4500);
    },

    wakeUp() {
      if (this.muted) { this.toggleMute(); return; }
      clearTimeout(this.idleTimer);
      if (this.dialogueState === 'talking') return;
      this.startIdle();
    },

    forceThink() {
      if (this.muted) return;
      if (this.dialogueState === 'talking') return;
      const who = Math.random() < 0.5 ? 'craft' : 'code';
      const p = this.pos[who];
      if (!p.grounded) return;
      if (p.state !== 'idle') this.setCharState(who, 'idle');
      this.runThinkingSequence(who);
    },

    makeAngry() {
      if (this.muted) return;
      if (this.dialogueState === 'talking') return;
      if (!this.pos.craft.grounded || !this.pos.code.grounded) return;
      this.setCharState('craft', 'surprised');
      this.setCharState('code',  'surprised');
      setTimeout(() => {
        if (this.pos.craft.state === 'surprised') this.setCharState('craft', 'idle');
        if (this.pos.code.state  === 'surprised') this.setCharState('code',  'idle');
      }, 900);
      // Magical "something shifted" vibe — no 4th-wall anger.
      this.playSequence([
        { who: 'craft', text: 'ты тоже это слышал?' },
        { who: 'code',  text: 'что-то шевельнулось' },
        { who: 'craft', text: 'прячемся' },
      ]);
    },

    toggleMute() {
      this.muted = !this.muted;
      localStorage.setItem('craftcode-companions-muted', this.muted ? '1' : '0');
      if (this.muted) {
        this.applyMute();
      } else {
        document.body.classList.remove('companions-muted');
        this.scheduleWander(5000);
        this.scheduleThinking(25000);
        this.scheduleToss(80000);
        const u = dialogue.pick('unmuted');
        if (u) this.playSequence(dialogue.play(u));
      }
    },

    applyMute() {
      document.body.classList.add('companions-muted');
      clearTimeout(this.idleTimer);
      clearTimeout(this.wanderTimer);
      clearTimeout(this.thinkingTimer);
      clearTimeout(this.tossTimer);
      this.queue = [];
      this.pendingAction = null;
      this.dialogueState = 'idle';
      // Snap both to their own per-bot floor so muted state is stable
      this.BOT_IDS.forEach(who => {
        const floor = this.floorYFor(who);
        const p = this.pos[who];
        p.vx = 0; p.vy = 0; p.walkTarget = null;
        if (p.y < floor) p.y = floor;
        p.grounded = true;
        this.applyPosition(who);
        this.setCharState(who, 'idle');
      });
      Object.values(this.bubbles).forEach(b => b.classList.remove('visible'));
    },
  };

  // Expose early so BootToPlayground can re-trigger init() after the
  // boot→playground transition finishes. Auto-init is ALSO attempted
  // here for pages that ship the DOM immediately (e.g. returning
  // visitors whose boot animation is skipped).
  if (typeof window !== 'undefined') {
    window.__companions = companions;
    window.__dialogue = dialogue;
    window.__SCENES = SCENES;

    // Re-render the currently-visible bubble when the user toggles language.
    // We don't restart the typewriter — just swap the final text of the
    // active bubble (post-typewriter) or overwrite what's been typed. The
    // latter is fine: the hold timeout still fires.
    try {
      window.addEventListener('langchange', () => {
        const active = companions._activeBubble;
        if (!active || !active.key) return;
        const bubble = companions.bubbles && companions.bubbles[active.who];
        if (!bubble) return;
        const textEl = bubble.querySelector('.text');
        if (!textEl) return;
        const next = dialogue._i18nText(active.key, active.fallback);
        if (typeof next === 'string') textEl.textContent = next;
      });
    } catch (_) {}
  }

  // Safe auto-init: bail out if the .companions container is missing
  // (docs pages that don't ship the playground).  The BootToPlayground
  // driver calls init() explicitly once the robot DOM is actually on
  // screen, so a no-op here is correct.
  const _tryInit = () => {
    if (companions._started) return;
    if (!document.querySelector('.companions')) return;
    // If the playground is hidden behind the boot phase, wait — the
    // BootToPlayground script will fire init() itself when ready.
    const stage = document.querySelector('.cc-stage');
    if (stage && stage.dataset.phase !== 'playground') return;
    companions.init();
    companions._started = true;
  };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _tryInit, { once: true });
    } else {
      _tryInit();
    }
  }
