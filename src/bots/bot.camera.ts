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
*/

type CameraState = {
  scale: number;
  tx: number;
  ty: number;
};

const DEADZONE_PX = 8;
const DEADZONE_SCALE = 0.04;
const MIN_SCALE = 0.7;
const MAX_SCALE = 1.5;
const TICK_MS = 120;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
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
  let dragging = false;
  let paused = false;
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

  const computeTarget = (): CameraState | null => {
    const playRect = play.getBoundingClientRect();
    if (playRect.width < 20 || playRect.height < 20) return null;

    // Collect bounding boxes — companions + any dynamic "appear" events.
    const dynamicEls = Array.from(
      document.querySelectorAll<HTMLElement>('[data-dynamic="appear"]'),
    );
    const targets = [...companions, ...dynamicEls];

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let count = 0;
    for (const el of targets) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      // getBoundingClientRect is already post-transform (visual). To get
      // the "world" rect we must undo the current camera transform.
      // Inverse: worldX = (clientX - playLeft - tx) / scale + playLeft ...
      // Simpler: compute target in *post-transform* space, then use the
      // same transform math (target recomputed next tick will converge).
      // We keep it post-transform for simplicity; the feedback loop
      // converges within 2-3 ticks.
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
    const bboxCy = (wMinY + wMaxY) / 2;

    const stageW = playRect.width;
    const stageH = playRect.height;

    // Base fit: ensure bbox + padding fits inside stage.
    const fitW = (stageW / Math.max(bboxW + 160, 1)) * 0.95;
    const fitH = (stageH / Math.max(bboxH + 160, 1)) * 0.95;
    let targetScale = clamp(Math.min(fitW, fitH), 0.85, MAX_SCALE);

    // Close-together → zoom in. Far-apart → zoom out past the base.
    if (bboxW < 120 && bboxH < 180) {
      targetScale = Math.min(MAX_SCALE, Math.max(targetScale, 1.35));
    } else if (bboxW > stageW * 0.7) {
      targetScale = Math.min(targetScale, 0.9);
    }
    targetScale = clamp(targetScale, MIN_SCALE, MAX_SCALE);

    // Translate so bbox center lands on stage center post-scale.
    const stageCx = stageW / 2;
    const stageCy = stageH / 2;
    const tx = (stageCx - bboxCx) * targetScale;
    const ty = (stageCy - bboxCy) * targetScale;

    return { scale: targetScale, tx, ty };
  };

  const tick = () => {
    if (paused || dragging) return;
    if (play.dataset.camera === 'off') {
      // Reset visual transform so bots appear at identity.
      if (state.scale !== 1 || state.tx !== 0 || state.ty !== 0) {
        state.scale = 1; state.tx = 0; state.ty = 0;
        applyTransform();
      }
      return;
    }
    const target = computeTarget();
    if (!target) return;

    // Deadzone — ignore tiny deltas to prevent micro-jitter.
    const dScale = Math.abs(target.scale - state.scale);
    const dTx = Math.abs(target.tx - state.tx);
    const dTy = Math.abs(target.ty - state.ty);
    if (dScale < DEADZONE_SCALE && dTx < DEADZONE_PX && dTy < DEADZONE_PX) return;

    state.scale = target.scale;
    state.tx = target.tx;
    state.ty = target.ty;
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
  };
  document.addEventListener('pointerdown', onPointerDown, { capture: true });
  document.addEventListener('pointerup', onPointerUp, { capture: true });
  document.addEventListener('pointercancel', onPointerUp, { capture: true });

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
  const onResize = () => { tick(); };
  window.addEventListener('resize', onResize);

  // Kick off — do a synchronous first tick so bots are framed on first paint.
  tick();
  startLoop();

  return () => {
    stopLoop();
    document.removeEventListener('pointerdown', onPointerDown, { capture: true } as any);
    document.removeEventListener('pointerup', onPointerUp, { capture: true } as any);
    document.removeEventListener('pointercancel', onPointerUp, { capture: true } as any);
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
