/* ══════════════════════════════════════════════════════
   CRAFTCODE — KAPLAY playground random events
   ══════════════════════════════════════════════════════
   Port of bot.events.ts (which drove legacy DOM playground)
   onto the KAPLAY runtime. Every 25-75s we fire ONE random
   event in the world:
     · item_spawn       — drop a physics-enabled emoji prop;
                          nearest bot reacts, partner comments.
     · platform_appear  — spawn a new pink platform that lives
                          ~45s then fades.
     · obstacle_move    — tween an existing static platform to
                          a new X.

   Public debug hook: window.__ccEvents = { trigger, pause, resume }.

   Honours prefers-reduced-motion (disables entirely) and
   document.visibilityState=hidden (defers scheduling).        */

import type { KaplayHandle, BotWho } from './kaplay.engine';
import type { GameObj, KAPLAYCtx } from 'kaplay';

type EventType = 'item_spawn' | 'obstacle_move' | 'platform_appear';
type ItemKind = 'coffee' | 'gear' | 'spring' | 'wrench' | 'bolt' | 'cube' | 'coin';

interface EventsApi {
  trigger: (type?: EventType) => void;
  pause: () => void;
  resume: () => void;
}

declare global {
  interface Window {
    __ccEvents?: EventsApi;
  }
}

// ── Config ────────────────────────────────────────────────
const MIN_INTERVAL_MS = 25_000;
const MAX_INTERVAL_MS = 75_000;
const ITEM_LIFETIME_S = 15;
const PLATFORM_LIFETIME_S = 45;
const EDGE_PAD = 40;
const MIN_CLEARANCE = 30;
const MAX_PLACEMENT_TRIES = 20;

const ITEMS: { kind: ItemKind; emoji: string }[] = [
  { kind: 'coffee', emoji: '☕' },
  { kind: 'gear',   emoji: '⚙' },
  { kind: 'spring', emoji: '🌀' },
  { kind: 'wrench', emoji: '🔧' },
  { kind: 'bolt',   emoji: '🔩' },
  { kind: 'cube',   emoji: '📦' },
  { kind: 'coin',   emoji: '🪙' },
];

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

interface Rect { x: number; y: number; w: number; h: number; }

function rectsOverlap(a: Rect, b: Rect, pad = 0): boolean {
  return !(a.x + a.w + pad < b.x || b.x + b.w + pad < a.x ||
           a.y + a.h + pad < b.y || b.y + b.h + pad < a.y);
}

// ── Main factory ──────────────────────────────────────────
export function initKaplayEvents(
  handle: KaplayHandle,
  opts: { reducedMotion?: boolean } = {},
): EventsApi {
  const k = handle.k;
  const { w: LOGICAL_W, h: LOGICAL_H } = handle.logical;
  const reduced = !!opts.reducedMotion;

  let paused = false;
  let disabled = reduced;
  let timer: ReturnType<typeof setTimeout> | null = null;

  // ── Geometry helpers ──────────────────────────────────
  const botRect = (who: BotWho): Rect | null => {
    const bot = handle.bots[who];
    if (!bot) return null;
    // Anchor is 'bot' (bottom-center) — approximate collision box is 32x40.
    return { x: bot.pos.x - 16, y: bot.pos.y - 40, w: 32, h: 40 };
  };

  const allBotRects = (): Rect[] =>
    (['craft', 'code'] as BotWho[])
      .map(botRect)
      .filter((r): r is Rect => r !== null);

  // All currently-live event objects (items + platforms) — used to keep
  // back-to-back spawns from overlapping visually.
  const eventRects = (): Rect[] => {
    const objs = k.get('event-entity');
    return objs.map((o: GameObj) => {
      const size = (o as unknown as { size?: { w: number; h: number } }).size;
      const w = size?.w ?? 24;
      const h = size?.h ?? 24;
      // Anchor 'center' — pos is middle; convert to top-left rect.
      return { x: o.pos.x - w / 2, y: o.pos.y - h / 2, w, h };
    });
  };

  // Static platforms (floor + original 3 platforms). Used for placement
  // avoidance when spawning items.
  const platformRects = (): Rect[] => {
    const objs = k.get('platform');
    return objs.map((o: GameObj) => {
      const raw = o as unknown as {
        size?: { w: number; h: number };
        _size?: { w: number; h: number };
        width?: number; height?: number;
      };
      const src = raw._size ?? raw.size;
      const w = src?.w ?? raw.width ?? 0;
      const h = src?.h ?? raw.height ?? 0;
      return { x: o.pos.x, y: o.pos.y, w, h };
    });
  };

  const findValidSpawnPos = (itemW: number, itemH: number): { x: number; y: number } | null => {
    const obs = platformRects();
    const bots = allBotRects();
    const dyn = eventRects();

    for (let i = 0; i < MAX_PLACEMENT_TRIES; i++) {
      const x = rand(EDGE_PAD, LOGICAL_W - EDGE_PAD - itemW);
      // Upper-mid band so items don't spawn glued to the floor.
      const y = rand(EDGE_PAD + 20, LOGICAL_H - EDGE_PAD - itemH - 40);
      const candidate: Rect = { x, y, w: itemW, h: itemH };
      let ok = true;
      for (const o of obs) { if (rectsOverlap(candidate, o, MIN_CLEARANCE)) { ok = false; break; } }
      if (!ok) continue;
      for (const b of bots) { if (rectsOverlap(candidate, b, MIN_CLEARANCE)) { ok = false; break; } }
      if (!ok) continue;
      for (const d of dyn) { if (rectsOverlap(candidate, d, MIN_CLEARANCE)) { ok = false; break; } }
      if (ok) return { x: x + itemW / 2, y: y + itemH / 2 }; // return center (anchor='center')
    }
    return null;
  };

  const nearestBotTo = (x: number, y: number): BotWho => {
    const rects = {
      craft: botRect('craft'),
      code:  botRect('code'),
    };
    const d = (r: Rect | null) => {
      if (!r) return Infinity;
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      return (cx - x) ** 2 + (cy - y) ** 2;
    };
    return d(rects.craft) <= d(rects.code) ? 'craft' : 'code';
  };

  const dialogueRef = (): { fire: (tag: string, who?: BotWho) => boolean } | undefined => {
    return (window as unknown as {
      __dialogue?: { fire: (tag: string, who?: BotWho) => boolean };
    }).__dialogue;
  };

  // ── Event impls ───────────────────────────────────────
  const spawnItem = (): boolean => {
    const p = findValidSpawnPos(24, 24);
    if (!p) return false;
    const it = pick(ITEMS);

    k.add([
      k.text(it.emoji, { size: 22 }),
      k.pos(p.x, p.y),
      k.area({ shape: new k.Rect(k.vec2(0), 24, 24) }),
      k.body({ gravityScale: 0.3 }),
      k.anchor('center'),
      k.lifespan(ITEM_LIFETIME_S, { fade: 1 }),
      'event-item',
      'event-entity',
      { kind: it.kind, size: { w: 24, h: 24 } },
    ]);

    // Dialogue reactions — nearest bot first, partner beats later.
    const nearest = nearestBotTo(p.x, p.y);
    const partner: BotWho = nearest === 'craft' ? 'code' : 'craft';
    const dlg = dialogueRef();
    if (dlg) {
      try { dlg.fire('event:item_spawn', nearest); } catch (_) {}
      setTimeout(() => { try { dlg.fire('event:item_seen', partner); } catch (_) {} }, 3200);
    }
    return true;
  };

  const spawnPlatform = (): boolean => {
    const platW = 80 + Math.floor(Math.random() * 80);
    const platH = 14 + Math.floor(Math.random() * 12);
    const p = findValidSpawnPos(platW, platH);
    if (!p) return false;

    // findValidSpawnPos returns center-anchor position for items — recompute
    // top-left for a platform (which has default top-left positioning).
    const left = p.x - platW / 2;
    const top  = p.y - platH / 2;

    k.add([
      k.sprite('hatch-event', { tiled: true, width: platW, height: platH }),
      k.pos(left, top),
      k.area({ shape: new k.Rect(k.vec2(0), platW, platH) }),
      k.body({ isStatic: true }),
      k.lifespan(PLATFORM_LIFETIME_S, { fade: 1 }),
      'platform',
      'event-platform',
      'event-entity',
      { size: { w: platW, h: platH }, _size: { w: platW, h: platH } },
    ]);

    const dlg = dialogueRef();
    if (dlg) { try { dlg.fire('event:platform_appear'); } catch (_) {} }
    return true;
  };

  const moveObstacle = (): boolean => {
    // Pick a static platform that is NOT the floor and NOT an event-spawned one.
    const candidates = k.get('platform').filter((o: GameObj) =>
      !o.is('floor') && !o.is('event-platform')
    );
    if (!candidates.length) return false;
    const target = pick(candidates);
    const raw = target as unknown as {
      size?: { w: number; h: number };
      _size?: { w: number; h: number };
      width?: number;
    };
    const w = raw._size?.w ?? raw.size?.w ?? raw.width ?? 0;

    let newX = target.pos.x;
    for (let i = 0; i < MAX_PLACEMENT_TRIES; i++) {
      const x = rand(EDGE_PAD, LOGICAL_W - EDGE_PAD - w);
      if (Math.abs(x - target.pos.x) < 60) continue;
      // Check clearance vs bots.
      const candidate: Rect = { x, y: target.pos.y, w, h: 0 };
      const bots = allBotRects();
      let ok = true;
      for (const b of bots) { if (rectsOverlap(candidate, b, 10)) { ok = false; break; } }
      if (!ok) continue;
      newX = x;
      break;
    }
    if (newX === target.pos.x) return false;

    // KAPLAY tween — signature: k.tween(from, to, duration, setter, easing?).
    // Guard for API availability across versions.
    try {
      if (typeof (k as unknown as { tween?: unknown }).tween === 'function') {
        (k as unknown as {
          tween: (
            from: number, to: number, dur: number,
            set: (v: number) => void, ease?: unknown,
          ) => unknown;
        }).tween(target.pos.x, newX, 1.5, (v) => { target.pos.x = v; });
      } else {
        target.pos.x = newX;
      }
    } catch (_) {
      target.pos.x = newX;
    }

    const dlg = dialogueRef();
    if (dlg) { try { dlg.fire('event:obstacle_move'); } catch (_) {} }
    return true;
  };

  const triggerOne = (forced?: EventType): boolean => {
    const type: EventType = forced ?? (pick(['item_spawn', 'obstacle_move', 'platform_appear']) as EventType);
    try {
      switch (type) {
        case 'item_spawn':      return spawnItem();
        case 'obstacle_move':   return moveObstacle();
        case 'platform_appear': return spawnPlatform();
      }
    } catch (_) { /* graceful — one failed event must not kill the scheduler */ }
    return false;
  };

  // ── Scheduler ─────────────────────────────────────────
  const scheduleNext = () => {
    if (disabled || paused) return;
    if (timer) clearTimeout(timer);
    const delay = rand(MIN_INTERVAL_MS, MAX_INTERVAL_MS);
    timer = setTimeout(() => {
      timer = null;
      if (disabled || paused) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        scheduleNext();
        return;
      }
      try { triggerOne(); } catch (_) {}
      scheduleNext();
    }, delay);
  };

  const pauseEvents = () => {
    paused = true;
    if (timer) { clearTimeout(timer); timer = null; }
  };
  const resumeEvents = () => {
    if (disabled) return;
    if (paused) { paused = false; scheduleNext(); }
  };

  if (!disabled) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        if (timer) { clearTimeout(timer); timer = null; }
      } else if (!paused && !disabled) {
        scheduleNext();
      }
    });
    scheduleNext();
  }

  const api: EventsApi = {
    trigger: (type?: EventType) => { try { triggerOne(type); } catch (_) {} },
    pause:   pauseEvents,
    resume:  resumeEvents,
  };
  if (typeof window !== 'undefined') {
    window.__ccEvents = api;
  }
  return api;
}

// Satisfy unused-import suggestions when this module is imported for side-effects only.
export type { KAPLAYCtx };
