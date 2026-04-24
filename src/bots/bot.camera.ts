/* ══════════════════════════════════════════════════════
   CRAFTCODE — Virtual camera for the companions playground
   ══════════════════════════════════════════════════════
   Applies a translate+scale transform to `.cc-stage-camera`
   so both robots remain comfortably framed regardless of
   their positions or the stage's responsive size.

   Key design notes:
   · The camera reads companion bounding boxes via
     getBoundingClientRect() relative to `.cc-stage-play`.
   · While the user is dragging a bot (body carries
     `.companions` child with a `dragging` character state,
     detected via `data-drag-active` set below), the camera
     is frozen so the existing drag math — which uses
     `.companions.getBoundingClientRect()` — stays valid.
   · Deadzones prevent camera jitter from sub-pixel noise.
   · When the terminal is open, we disable the transform
     entirely (data-camera="off") so the bots read at their
     natural scale in the background.
   · `prefers-reduced-motion` removes the smooth transition
     but still positions the transform (so mobile users keep
     bots in-frame — it's not decorative).

   Calm-mode tuning (2026-04):
     · Larger deadzones (18px / 0.07) — sub-pixel wiggle stops
       producing any work.
     · Exponential smoothing on the target (α≈0.16) — large
       jumps become an asymptotic glide instead of a snap.
     · Hysteresis on the "close-together" zoom-in and the
       "spread-apart" zoom-out — entering a zoom state takes
       a stronger trigger than leaving it, so bots hovering
       near the threshold don't rattle between modes.
     · No-reframe window — if the bbox center hasn't shifted
       >40px across the last 400ms of samples, the camera just
       rests. Idle micro-motion never reaches the transform.
     · Per-tick clamps — even on a big jump, scale changes at
       most 0.03 and translate at most 60px per tick, so the
       loop feels like inertia rather than teleport.
     · Tick interval 180ms — the CSS transition (750ms) does
       the visual work; we just don't need to recompute that
       often.
*/

type CameraState = {
  scale: number;
  tx: number;
  ty: number;
};

// ─── Calm tuning constants ────────────────────────────────
// Deadzone: raised from 8px / 0.04 so idle micro-drift is
// completely absorbed. Anything below these thresholds skips
// the transform entirely.
// Bumped 18 → 22px: final micro-jitter guard.
const DEADZONE_PX = 22;
const DEADZONE_SCALE = 0.07;
const MIN_SCALE = 0.7;
const MAX_SCALE = 1.5;
// Tick ceiling: we recompute at ~5.5 Hz instead of 8.3 Hz.
// The 750ms CSS transition is what the eye actually sees;
// ticking faster just spends CPU.
const TICK_MS = 180;
// Exponential smoothing factor applied to the *target* each
// tick. α=0.16 ≈ 6-tick time constant (~1.1s @ 180ms) — big
// intentional moves still catch up in ~1s, but small twitches
// decay before they ever reach the transform.
// Lowered 0.16 → 0.12: slightly longer time constant (~9-tick,
// ~1.6s @ 180ms). Makes the target glide even calmer.
const TARGET_ALPHA = 0.12;
// Per-tick clamps: even if the smoothed target demands more,
// we only step this far per tick. Prevents any remaining
// visual snap on state reset / resize.
const MAX_DSCALE_PER_TICK = 0.03;
const MAX_DTRANSLATE_PER_TICK = 60;
// Hysteresis — entry is harder than exit by ~30–35%.
const ZOOM_IN_BBOX_W = 120;   // enter "close" mode below this
const ZOOM_IN_BBOX_H = 180;
const ZOOM_OUT_BBOX_W = 160;  // leave "close" mode above this
const ZOOM_OUT_BBOX_H = 230;
const WIDE_ENTER_RATIO = 0.70; // enter "spread" mode above this * stageW
const WIDE_EXIT_RATIO = 0.60;  // leave "spread" mode below this * stageW
// No-reframe window: if bbox center hasn't drifted this far
// over the last N ms, skip recomputation entirely.
const IDLE_WINDOW_MS = 400;
// Bumped 40 → 60px: in resting state the minor bobbing from
// idle-frame flips was still sneaking past the old threshold.
const IDLE_MOTION_PX = 60;
// Ignore-window after a known "instant" event (spawn item /
// platform_appear) — we don't want the camera to lunge toward
// the freshly-appeared element immediately. Instead the usual
// idle window kicks back in after this delay.
const EVENT_IGNORE_MS = 2000;
// Foot-anchor bias: companion sprites are visually floor-anchored
// at ~75% of their height (see engine.legacy.js FOOT_Y constants).
// Biasing bbox center toward the feet keeps the camera framing
// the "stance" of the bots rather than the geometric middle of
// the sprite frame, which looks more stable during idle bobbing.
// Tuned 0.75 → 0.72 (revision #1): 0.75 pushed the frame slightly
// too low, clipping the platform/crate tops above the bots; 0.72
// sits just above the feet centroid and keeps more headroom.
const FOOT_ANCHOR_RATIO = 0.72;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function approach(current: number, target: number, maxStep: number): number {
  const d = target - current;
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
}

export function initCamera(): () => void {
  if (typeof document === 'undefined') return () => {};
  const play = document.querySelector<HTMLElement>('.cc-stage-play');
  const cam = document.querySelector<HTMLElement>('.cc-stage-camera');
  if (!play || !cam) return () => {};

  const companions = Array.from(
    document.querySelectorAll<HTMLElement>('.companion[data-who]'),
  );
  if (companions.length === 0) return () => {};

  const state: CameraState = { scale: 1, tx: 0, ty: 0 };
  // Smoothed target — what we're lerping state toward. We
  // update this from the raw computed target each tick via
  // exponential smoothing, then step `state` toward it under
  // the per-tick clamps.
  const target: CameraState = { scale: 1, tx: 0, ty: 0 };
  // Hysteresis flags — persisted across ticks so the mode
  // thresholds apply asymmetrically.
  let inCloseMode = false;
  let inWideMode = false;
  // Idle-window tracking: history of recent bbox-center
  // samples, used to decide whether anything moved enough to
  // warrant recomputing target at all.
  type Sample = { t: number; cx: number; cy: number };
  const history: Sample[] = [];
  let dragging = false;
  let paused = false;
  // Timestamp until which we ignore "appear"-type dynamic
  // elements in the bbox calc. Set whenever bot.events fires a
  // spawn — see `cc:event-spawn` listener below.
  let ignoreEventsUntil = 0;
  let rafId: number | null = null;
  let intervalId: number | null = null;
  let lastTick = 0;

  const applyTransform = () => {
    // NB: translate first, then scale — matches the math used when
    // computing tx/ty below (target = (stageCx - bboxCx) * scale).
    cam.style.transform = `translate(${state.tx.toFixed(2)}px, ${state.ty.toFixed(2)}px) scale(${state.scale.toFixed(3)})`;
    cam.dataset.ccCamScale = state.scale.toFixed(3);
    cam.dataset.ccCamTx = state.tx.toFixed(1);
    cam.dataset.ccCamTy = state.ty.toFixed(1);
  };

  const computeTarget = (): { cam: CameraState; bboxCx: number; bboxCy: number } | null => {
    const playRect = play.getBoundingClientRect();
    if (playRect.width < 20 || playRect.height < 20) return null;

    // Collect bounding boxes — companions + any dynamic "appear" events.
    // Within the post-event ignore window we only frame the companions
    // themselves, so a freshly spawned item doesn't yank the camera.
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const includeDynamic = now >= ignoreEventsUntil;
    const dynamicEls = includeDynamic
      ? Array.from(document.querySelectorAll<HTMLElement>('[data-dynamic="appear"]'))
      : [];
    const targets = [...companions, ...dynamicEls];

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let count = 0;
    for (const el of targets) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const cx = r.left - playRect.left;
      const cy = r.top - playRect.top;
      minX = Math.min(minX, cx);
      minY = Math.min(minY, cy);
      maxX = Math.max(maxX, cx + r.width);
      maxY = Math.max(maxY, cy + r.height);
      count++;
    }
    if (count < 2) return null;

    // Convert current (visual) bbox back to world-space by undoing the
    // current transform. Transform in CSS is: translate(tx,ty) scale(s)
    // with origin at stage center. Visual = center + (world - center) * s + (tx, ty).
    // => world = center + (visual - center - (tx,ty)) / s
    const sCx = playRect.width / 2;
    const sCy = playRect.height / 2;
    const s = state.scale;
    const untransform = (vx: number, vy: number) => ({
      x: sCx + (vx - sCx - state.tx) / s,
      y: sCy + (vy - sCy - state.ty) / s,
    });
    const tl = untransform(minX, minY);
    const br = untransform(maxX, maxY);
    const wMinX = tl.x, wMinY = tl.y, wMaxX = br.x, wMaxY = br.y;
    const bboxW = Math.max(1, wMaxX - wMinX);
    const bboxH = Math.max(1, wMaxY - wMinY);
    const bboxCx = (wMinX + wMaxX) / 2;
    // Vertical anchor biased toward the feet (~75% down the bbox)
    // instead of the geometric middle. Keeps framing visually
    // stable during the idle-frame bobbing because the feet are
    // the only truly floor-pinned pixels on the sprite.
    const bboxCy = wMinY + bboxH * FOOT_ANCHOR_RATIO;

    const stageW = playRect.width;
    const stageH = playRect.height;

    // Base fit: ensure bbox + padding fits inside stage.
    const fitW = (stageW / Math.max(bboxW + 160, 1)) * 0.95;
    const fitH = (stageH / Math.max(bboxH + 160, 1)) * 0.95;
    let targetScale = clamp(Math.min(fitW, fitH), 0.85, MAX_SCALE);

    // Hysteresis: close-together zoom-in.
    // Enter when bbox is clearly small; only exit once it has
    // grown comfortably past the exit threshold. Prevents the
    // mode from flipping when bots hover near the boundary.
    if (inCloseMode) {
      if (bboxW > ZOOM_OUT_BBOX_W || bboxH > ZOOM_OUT_BBOX_H) {
        inCloseMode = false;
      }
    } else {
      if (bboxW < ZOOM_IN_BBOX_W && bboxH < ZOOM_IN_BBOX_H) {
        inCloseMode = true;
      }
    }
    // Hysteresis: spread-apart zoom-out.
    if (inWideMode) {
      if (bboxW < stageW * WIDE_EXIT_RATIO) {
        inWideMode = false;
      }
    } else {
      if (bboxW > stageW * WIDE_ENTER_RATIO) {
        inWideMode = true;
      }
    }

    if (inCloseMode) {
      targetScale = Math.min(MAX_SCALE, Math.max(targetScale, 1.35));
    } else if (inWideMode) {
      targetScale = Math.min(targetScale, 0.9);
    }
    targetScale = clamp(targetScale, MIN_SCALE, MAX_SCALE);

    // Translate so bbox center lands on stage center post-scale.
    const stageCx = stageW / 2;
    const stageCy = stageH / 2;
    const tx = (stageCx - bboxCx) * targetScale;
    const ty = (stageCy - bboxCy) * targetScale;

    return { cam: { scale: targetScale, tx, ty }, bboxCx, bboxCy };
  };

  const tick = () => {
    if (paused || dragging) return;
    if (play.dataset.camera === 'off') {
      // Reset visual transform so bots appear at identity.
      // Clear smoothing + history so we start fresh on resume.
      if (state.scale !== 1 || state.tx !== 0 || state.ty !== 0) {
        state.scale = 1; state.tx = 0; state.ty = 0;
        target.scale = 1; target.tx = 0; target.ty = 0;
        history.length = 0;
        applyTransform();
      }
      return;
    }
    const computed = computeTarget();
    if (!computed) return;

    // No-reframe window: if bbox center drift stays within
    // IDLE_MOTION_PX over IDLE_WINDOW_MS, don't update target.
    // The camera simply holds where it last settled. Idle
    // micro-motion never triggers any work.
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    history.push({ t: now, cx: computed.bboxCx, cy: computed.bboxCy });
    while (history.length > 0 && now - history[0].t > IDLE_WINDOW_MS) {
      history.shift();
    }
    let isIdle = false;
    if (history.length >= 2) {
      let minCx = Infinity, maxCx = -Infinity, minCy = Infinity, maxCy = -Infinity;
      for (const s of history) {
        if (s.cx < minCx) minCx = s.cx;
        if (s.cx > maxCx) maxCx = s.cx;
        if (s.cy < minCy) minCy = s.cy;
        if (s.cy > maxCy) maxCy = s.cy;
      }
      const spread = Math.max(maxCx - minCx, maxCy - minCy);
      if (spread < IDLE_MOTION_PX) isIdle = true;
    }

    // Exponential smoothing of the *target*. When idle, we
    // freeze target drift (α=0) so even tiny computed wobble
    // doesn't accumulate into a visible nudge.
    const alpha = isIdle ? 0 : TARGET_ALPHA;
    target.scale += (computed.cam.scale - target.scale) * alpha;
    target.tx += (computed.cam.tx - target.tx) * alpha;
    target.ty += (computed.cam.ty - target.ty) * alpha;

    // Deadzone — ignore tiny deltas between current state and
    // smoothed target. This is the final micro-jitter guard.
    const dScale = Math.abs(target.scale - state.scale);
    const dTx = Math.abs(target.tx - state.tx);
    const dTy = Math.abs(target.ty - state.ty);
    if (dScale < DEADZONE_SCALE && dTx < DEADZONE_PX && dTy < DEADZONE_PX) return;

    // Per-tick clamp: step toward target under caps. Keeps
    // large jumps (resize, terminal close) smooth rather than
    // jarring.
    state.scale = approach(state.scale, target.scale, MAX_DSCALE_PER_TICK);
    state.tx = approach(state.tx, target.tx, MAX_DTRANSLATE_PER_TICK);
    state.ty = approach(state.ty, target.ty, MAX_DTRANSLATE_PER_TICK);
    applyTransform();
  };

  // RAF-throttled loop — we only actually tick every TICK_MS.
  const loop = (t: number) => {
    rafId = requestAnimationFrame(loop);
    if (t - lastTick < TICK_MS) return;
    lastTick = t;
    tick();
  };

  const startLoop = () => {
    stopLoop();
    if (typeof requestAnimationFrame === 'function') {
      rafId = requestAnimationFrame(loop);
    } else {
      intervalId = window.setInterval(tick, TICK_MS);
    }
  };
  const stopLoop = () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    if (intervalId !== null) clearInterval(intervalId);
    rafId = null;
    intervalId = null;
  };

  // Drag detection — freeze camera while a companion is being dragged.
  // We piggyback on pointerdown/up at the document level so we don't
  // have to coordinate with engine.legacy.js internals.
  const isCompanionPointer = (e: PointerEvent): boolean => {
    const t = e.target as Element | null;
    return !!t?.closest?.('.companion[data-who]');
  };
  const onPointerDown = (e: PointerEvent) => {
    if (!isCompanionPointer(e)) return;
    dragging = true;
    // Freeze the transition so nothing glides mid-drag.
    cam.style.transition = 'none';
  };
  const onPointerUp = () => {
    if (!dragging) return;
    dragging = false;
    // Restore smooth transition (reduced-motion users opt out via CSS).
    cam.style.transition = '';
    // Post-drag, bot positions may have changed a lot — reset
    // the idle history so the camera can re-frame without the
    // window vetoing it.
    history.length = 0;
  };
  document.addEventListener('pointerdown', onPointerDown, { capture: true });
  document.addEventListener('pointerup', onPointerUp, { capture: true });
  document.addEventListener('pointercancel', onPointerUp, { capture: true });

  // bot.events → camera: brief ignore-window after a spawn so the
  // camera doesn't jerk toward a freshly materialised item / platform.
  const onEventSpawn = () => {
    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    ignoreEventsUntil = t + EVENT_IGNORE_MS;
  };
  document.addEventListener('cc:event-spawn', onEventSpawn);

  // Terminal integration — switch camera off while the user is typing.
  const onTermOpen = () => { play.dataset.camera = 'off'; };
  const onTermClose = () => { play.dataset.camera = 'follow'; };
  document.addEventListener('cc:terminal-open', onTermOpen);
  document.addEventListener('cc:terminal-close', onTermClose);

  // Pause on visibility hidden, resume on visible.
  const onVisibility = () => {
    if (document.hidden) {
      paused = true;
      stopLoop();
    } else {
      paused = false;
      startLoop();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  // Resize → recompute immediately so mobile rotation doesn't leave bots OOB.
  // Also flush history so the idle window doesn't suppress the
  // legitimately-large post-resize reframe.
  const onResize = () => { history.length = 0; tick(); };
  window.addEventListener('resize', onResize);

  // Kick off — do a synchronous first tick so bots are framed on first paint.
  tick();
  startLoop();

  return () => {
    stopLoop();
    document.removeEventListener('pointerdown', onPointerDown, { capture: true } as any);
    document.removeEventListener('pointerup', onPointerUp, { capture: true } as any);
    document.removeEventListener('pointercancel', onPointerUp, { capture: true } as any);
    document.removeEventListener('cc:event-spawn', onEventSpawn);
    document.removeEventListener('cc:terminal-open', onTermOpen);
    document.removeEventListener('cc:terminal-close', onTermClose);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', onResize);
  };
}

// Auto-init once the playground element exists. We retry a few times
// because engine.legacy.js also waits for DOMContentLoaded and we want
// to run after both companion elements have mounted.
if (typeof document !== 'undefined') {
  const tryInit = (retries = 20) => {
    const play = document.querySelector('.cc-stage-play');
    const cam = document.querySelector('.cc-stage-camera');
    const bots = document.querySelectorAll('.companion[data-who]');
    if (play && cam && bots.length >= 2) {
      initCamera();
      return;
    }
    if (retries > 0) setTimeout(() => tryInit(retries - 1), 120);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => tryInit());
  } else {
    tryInit();
  }
}
