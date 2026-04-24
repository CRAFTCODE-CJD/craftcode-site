/* ══════════════════════════════════════════════════════
   CRAFTCODE — Playground random events (item spawn,
   platform appear, obstacle move)
   ══════════════════════════════════════════════════════
   Every 25–75 s we fire ONE random event on the playground:
     · item_spawn       — drop a little prop in a valid spot;
                          nearest bot reacts, the other comments.
     · obstacle_move    — slide one of the static `.companions-obstacle`
                          platforms to a new X (CSS transition).
     · platform_appear  — spawn a brand-new platform (data-dynamic="appear"
                          so the virtual camera frames it), lives 30-60 s
                          then fades out.

   Public debug hook: window.__ccEvents = { trigger(type?), pause, resume }.

   Honours:
     · `prefers-reduced-motion` — fully disables events.
     · `document.visibilityState === 'hidden'` — pauses the timer.
     · waits for `window.__companions._started === true` before firing
       the first event.
*/

import type { LegacyCompanionsGlobal } from './bot.types';

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
const ITEM_LIFETIME_MIN_MS = 10_000;
const ITEM_LIFETIME_MAX_MS = 20_000;
const PLATFORM_LIFETIME_MIN_MS = 30_000;
const PLATFORM_LIFETIME_MAX_MS = 60_000;
const EDGE_PAD = 40;                // keep spawn away from stage edges
const MIN_CLEARANCE = 30;           // px clearance vs obstacles/bots
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

// ── Module state ──────────────────────────────────────────
let paused = false;
let disabled = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let stylesInjected = false;

// Small helpers
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const randInt = (lo: number, hi: number) => Math.floor(rand(lo, hi + 1));
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

function injectStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  stylesInjected = true;
  const css = `
    .cc-event-item {
      position: absolute;
      width: 24px; height: 24px;
      display: grid; place-items: center;
      font-size: 20px; line-height: 1;
      pointer-events: none;
      z-index: 6;
      filter: drop-shadow(0 0 6px color-mix(in oklab, var(--accent, #f39) 55%, transparent));
      animation: cc-event-pop-in 420ms cubic-bezier(.2, .9, .3, 1.2) both;
    }
    .cc-event-item.cc-fade-out {
      animation: cc-event-fade-out 700ms ease both;
    }
    @keyframes cc-event-pop-in {
      0%   { transform: translateY(-18px) scale(0.2); opacity: 0; }
      60%  { transform: translateY(2px)   scale(1.12); opacity: 1; }
      100% { transform: translateY(0)     scale(1);    opacity: 1; }
    }
    @keyframes cc-event-fade-out {
      to { transform: translateY(-14px) scale(0.6); opacity: 0; }
    }
    .cc-event-platform {
      position: absolute;
      background: repeating-linear-gradient(
        45deg,
        color-mix(in oklab, var(--accent-2, #ffcf3f) 80%, transparent) 0 6px,
        color-mix(in oklab, var(--accent-2, #ffcf3f) 40%, transparent) 6px 12px
      );
      border: 1px solid color-mix(in oklab, var(--accent-2, #ffcf3f) 80%, transparent);
      border-radius: 4px;
      z-index: 3;
      animation: cc-event-platform-in 500ms ease both;
      box-shadow: 0 0 18px color-mix(in oklab, var(--accent-2, #ffcf3f) 45%, transparent);
    }
    .cc-event-platform.cc-fade-out {
      animation: cc-event-platform-out 700ms ease both;
    }
    @keyframes cc-event-platform-in {
      from { transform: scale(0.3); opacity: 0; }
      to   { transform: scale(1);   opacity: 1; }
    }
    @keyframes cc-event-platform-out {
      to { transform: scale(0.6); opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .cc-event-item, .cc-event-platform { animation: none !important; }
    }
  `;
  const style = document.createElement('style');
  style.id = 'cc-events-style';
  style.textContent = css;
  document.head.appendChild(style);
}

// ── Geometry helpers ──────────────────────────────────────
interface Rect { x: number; y: number; w: number; h: number; }

function getStage(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.cc-stage-play');
}
function getCompanionsContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.companions');
}

function companionsRect(): { craft: Rect | null; code: Rect | null } {
  const out: { craft: Rect | null; code: Rect | null } = { craft: null, code: null };
  const comp = getCompanionsContainer();
  if (!comp) return out;
  const host = comp.getBoundingClientRect();
  (['craft', 'code'] as const).forEach((who) => {
    const el = document.querySelector<HTMLElement>(`.companion[data-who="${who}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    out[who] = {
      x: r.left - host.left,
      y: r.top - host.top,
      w: r.width,
      h: r.height,
    };
  });
  return out;
}

function obstacleRects(): Rect[] {
  const comp = getCompanionsContainer();
  if (!comp) return [];
  const host = comp.getBoundingClientRect();
  return Array.from(comp.querySelectorAll<HTMLElement>('[data-ob]'))
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - host.left, y: r.top - host.top, w: r.width, h: r.height };
    });
}

function rectsOverlap(a: Rect, b: Rect, pad = 0): boolean {
  return !(a.x + a.w + pad < b.x || b.x + b.w + pad < a.x ||
           a.y + a.h + pad < b.y || b.y + b.h + pad < a.y);
}

function findValidSpawnPos(itemW: number, itemH: number): { x: number; y: number } | null {
  const comp = getCompanionsContainer();
  if (!comp) return null;
  const w = comp.clientWidth;
  const h = comp.clientHeight;
  if (w < 120 || h < 80) return null;
  const obs = obstacleRects();
  const bots = companionsRect();
  const botRects = [bots.craft, bots.code].filter((r): r is Rect => r !== null);

  for (let i = 0; i < MAX_PLACEMENT_TRIES; i++) {
    const x = rand(EDGE_PAD, w - EDGE_PAD - itemW);
    // Prefer upper-mid area (so items "float" / are visible above floor)
    const y = rand(EDGE_PAD, h - EDGE_PAD - itemH - 20);
    const candidate: Rect = { x, y, w: itemW, h: itemH };
    let ok = true;
    for (const o of obs) {
      if (rectsOverlap(candidate, o, MIN_CLEARANCE)) { ok = false; break; }
    }
    if (!ok) continue;
    for (const b of botRects) {
      if (rectsOverlap(candidate, b, MIN_CLEARANCE)) { ok = false; break; }
    }
    if (ok) return { x, y };
  }
  return null;
}

// ── Bot proximity → nearest/other id ──────────────────────
function nearestBotTo(x: number, y: number): 'craft' | 'code' {
  const rects = companionsRect();
  const dist = (r: Rect | null) => {
    if (!r) return Infinity;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const dx = cx - x;
    const dy = cy - y;
    return dx * dx + dy * dy;
  };
  return dist(rects.craft) <= dist(rects.code) ? 'craft' : 'code';
}

// ── Event implementations ────────────────────────────────
function legacy(): LegacyCompanionsGlobal | undefined {
  return typeof window !== 'undefined' ? window.__companions : undefined;
}

function dialogueRef(): { fire: (tag: string, who?: 'craft' | 'code') => boolean } | undefined {
  const w = window as unknown as { __dialogue?: { fire: (tag: string, who?: 'craft' | 'code') => boolean } };
  return w.__dialogue;
}

function spawnItem(): boolean {
  const comp = getCompanionsContainer();
  if (!comp) return false;
  injectStyles();
  const item = pick(ITEMS);
  const pos = findValidSpawnPos(24, 24);
  if (!pos) return false;

  const el = document.createElement('div');
  el.className = 'cc-event-item';
  el.dataset.item = item.kind;
  el.setAttribute('data-cc-event', 'item_spawn');
  el.setAttribute('data-dynamic', 'appear');
  el.style.left = `${pos.x}px`;
  el.style.top  = `${pos.y}px`;
  el.textContent = item.emoji;
  el.setAttribute('aria-hidden', 'true');
  comp.appendChild(el);

  // Fire dialogue: nearest bot reacts, partner comments a beat later.
  const nearest = nearestBotTo(pos.x + 12, pos.y + 12);
  const partner = nearest === 'craft' ? 'code' : 'craft';
  const dlg = dialogueRef();
  if (dlg) {
    try { dlg.fire('event:item_spawn', nearest); } catch (_) {}
    // Second reaction slightly delayed so it doesn't clobber the first.
    setTimeout(() => {
      try { dlg.fire('event:item_seen', partner); } catch (_) {}
    }, 3200);
  }

  // Fade-out + remove
  const lifetime = rand(ITEM_LIFETIME_MIN_MS, ITEM_LIFETIME_MAX_MS);
  setTimeout(() => {
    el.classList.add('cc-fade-out');
    setTimeout(() => { try { el.remove(); } catch (_) {} }, 800);
  }, lifetime);
  return true;
}

function moveObstacle(): boolean {
  const comp = getCompanionsContainer();
  if (!comp) return false;
  // Pick a STATIC obstacle (static = has data-ob but no data-cc-event attribute,
  // so we skip our own spawned platforms).
  const candidates = Array.from(
    comp.querySelectorAll<HTMLElement>('[data-ob]:not([data-cc-event])'),
  );
  if (!candidates.length) return false;
  const target = pick(candidates);

  const w = comp.clientWidth;
  // Resolve current left in px (may be expressed as %).
  const rect = target.getBoundingClientRect();
  const hostRect = comp.getBoundingClientRect();
  const curLeft = rect.left - hostRect.left;
  const obW = rect.width;
  const obH = rect.height;
  // Pick a new X at least 60px away, inside stage, respecting edge pad.
  let newLeft = curLeft;
  for (let i = 0; i < MAX_PLACEMENT_TRIES; i++) {
    const x = rand(EDGE_PAD, Math.max(EDGE_PAD + 1, w - EDGE_PAD - obW));
    if (Math.abs(x - curLeft) < 60) continue;
    // Avoid stacking into a bot
    const candidate: Rect = { x, y: rect.top - hostRect.top, w: obW, h: obH };
    const bots = companionsRect();
    let ok = true;
    for (const b of [bots.craft, bots.code]) {
      if (b && rectsOverlap(candidate, b, 10)) { ok = false; break; }
    }
    if (!ok) continue;
    newLeft = x;
    break;
  }
  if (newLeft === curLeft) return false;

  // Apply smooth CSS transition. Preserve existing right/left style by
  // forcing `left` + clearing `right`.
  const prevTransition = target.style.transition;
  target.style.transition = 'left 1400ms cubic-bezier(.4,.02,.2,1)';
  target.style.right = 'auto';
  target.style.left = `${newLeft}px`;
  // Reset transition after motion completes.
  setTimeout(() => { target.style.transition = prevTransition; }, 1600);

  // Trigger physics rescan — most engines have refreshObstacles().
  const eng = legacy() as any;
  if (eng && typeof eng.refreshObstacles === 'function') {
    setTimeout(() => { try { eng.refreshObstacles(); } catch (_) {} }, 1500);
  }

  const dlg = dialogueRef();
  if (dlg) { try { dlg.fire('event:obstacle_move'); } catch (_) {} }
  return true;
}

function spawnPlatform(): boolean {
  const comp = getCompanionsContainer();
  if (!comp) return false;
  injectStyles();
  const platW = 80 + Math.floor(Math.random() * 80);   // 80-160
  const platH = 14 + Math.floor(Math.random() * 12);   // 14-26
  const pos = findValidSpawnPos(platW, platH);
  if (!pos) return false;

  const el = document.createElement('div');
  el.className = 'companions-obstacle cc-event-platform';
  el.setAttribute('data-ob', '');
  el.setAttribute('data-dynamic', 'appear');
  el.setAttribute('data-cc-event', 'platform_appear');
  el.style.left = `${pos.x}px`;
  el.style.top  = `${pos.y}px`;
  el.style.width  = `${platW}px`;
  el.style.height = `${platH}px`;
  comp.appendChild(el);

  const eng = legacy() as any;
  if (eng && typeof eng.refreshObstacles === 'function') {
    try { eng.refreshObstacles(); } catch (_) {}
  }

  const dlg = dialogueRef();
  if (dlg) { try { dlg.fire('event:platform_appear'); } catch (_) {} }

  const lifetime = rand(PLATFORM_LIFETIME_MIN_MS, PLATFORM_LIFETIME_MAX_MS);
  setTimeout(() => {
    el.classList.add('cc-fade-out');
    setTimeout(() => {
      try { el.remove(); } catch (_) {}
      const eng2 = legacy() as any;
      if (eng2 && typeof eng2.refreshObstacles === 'function') {
        try { eng2.refreshObstacles(); } catch (_) {}
      }
    }, 800);
  }, lifetime);
  return true;
}

function triggerOne(forced?: EventType): boolean {
  const type: EventType = forced ?? (pick(['item_spawn', 'obstacle_move', 'platform_appear']) as EventType);
  let ok = false;
  switch (type) {
    case 'item_spawn':      ok = spawnItem(); break;
    case 'obstacle_move':   ok = moveObstacle(); break;
    case 'platform_appear': ok = spawnPlatform(); break;
  }
  // Notify the camera (and anyone else listening) about the instant
  // appearance — used to suppress a camera lunge toward the new el.
  if (ok && typeof document !== 'undefined') {
    try {
      document.dispatchEvent(new CustomEvent('cc:event-spawn', { detail: { type } }));
    } catch (_) { /* old browsers — ignore */ }
  }
  return ok;
}

// ── Scheduler ────────────────────────────────────────────
function scheduleNext() {
  if (disabled || paused) return;
  if (timer) clearTimeout(timer);
  const delay = rand(MIN_INTERVAL_MS, MAX_INTERVAL_MS);
  timer = setTimeout(() => {
    timer = null;
    if (disabled || paused) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      // Defer until visible again.
      scheduleNext();
      return;
    }
    try { triggerOne(); } catch (_) {}
    scheduleNext();
  }, delay);
}

function pauseEvents() {
  paused = true;
  if (timer) { clearTimeout(timer); timer = null; }
}
function resumeEvents() {
  if (disabled) return;
  if (paused) {
    paused = false;
    scheduleNext();
  }
}

// ── Bootstrap ────────────────────────────────────────────
function start() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  // prefers-reduced-motion → disabled entirely.
  const mq = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  if (mq && mq.matches) {
    disabled = true;
  } else {
    injectStyles();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        if (timer) { clearTimeout(timer); timer = null; }
      } else if (!paused && !disabled) {
        scheduleNext();
      }
    });
    scheduleNext();
  }
  // Always expose the debug API (even in reduced-motion — trigger() stays
  // useful for manual QA).
  window.__ccEvents = {
    trigger: (type?: EventType) => { try { triggerOne(type); } catch (_) {} },
    pause:   pauseEvents,
    resume:  resumeEvents,
  };
}

function waitForEngineAndStart(retries = 40) {
  if (typeof window === 'undefined') return;
  const eng = window.__companions as (LegacyCompanionsGlobal & { _started?: boolean }) | undefined;
  const ready = !!(eng && (eng as any)._started === true);
  const play = typeof document !== 'undefined' && document.querySelector('.cc-stage-play');
  if (ready && play) {
    start();
    return;
  }
  if (retries <= 0) return;
  setTimeout(() => waitForEngineAndStart(retries - 1), 500);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => waitForEngineAndStart());
  } else {
    waitForEngineAndStart();
  }
}

export {};
