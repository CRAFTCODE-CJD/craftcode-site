/* ══════════════════════════════════════════════════════
   CRAFTCODE — Bot engine facade (Read.txt §1.2–1.4)
   ══════════════════════════════════════════════════════
   Thin TypeScript layer on top of engine.legacy.js. Keeps the
   proven 2,380-line physics + dialogue runtime intact while
   adding:
     · explicit BotState machine (idle / greeting / explaining /
       thinking / glitch / easter)
     · typed say() / fire() API
     · state-change subscription for external UI (e.g. the fake
       terminal, CSS class sync on .companions host)             */

import type {
  BotEngineHandle,
  BotState,
  BotId,
  BotLine,
  LegacyCompanionsGlobal,
} from './bot.types';

// Side-effect import — engine.legacy.js attaches its API to window.__companions
// once the DOM is ready. Astro's <script> bundles this into a defer module.
import './engine.legacy.js';
// Virtual camera — auto-initialises on DOM ready. Keeps both robots framed.
import './bot.camera';
// Random playground events (item/platform spawn, obstacle moves).
// Self-inits on DOM ready + waits for __companions._started. Opts out
// under prefers-reduced-motion.
import './bot.events';

type Listener = (s: BotState) => void;

function createHandle(): BotEngineHandle {
  let state: BotState = 'idle';
  const listeners = new Set<Listener>();

  // Map BotState → CSS modifier on the host element so styles can react.
  const applyClass = (s: BotState) => {
    if (typeof document === 'undefined') return;
    const host = document.querySelector<HTMLElement>('.companions');
    if (!host) return;
    host.dataset.botState = s;
  };

  // Most high-level transitions auto-release back to `idle` after a beat,
  // unless another state supersedes them. Glitch/easter linger a touch longer.
  const HOLD_MS: Record<BotState, number> = {
    idle: 0,
    greeting: 2_400,
    explaining: 3_200,
    thinking: 1_800,
    glitch: 2_000,
    easter: 3_000,
  };
  let releaseTimer: ReturnType<typeof setTimeout> | null = null;

  const setState: BotEngineHandle['setState'] = (next) => {
    if (next === state) return;
    state = next;
    applyClass(state);
    listeners.forEach((cb) => cb(state));
    if (releaseTimer) clearTimeout(releaseTimer);
    const hold = HOLD_MS[next];
    if (hold > 0 && next !== 'idle') {
      releaseTimer = setTimeout(() => {
        state = 'idle';
        applyClass(state);
        listeners.forEach((cb) => cb(state));
      }, hold);
    }
  };

  const legacy = (): LegacyCompanionsGlobal | undefined =>
    typeof window !== 'undefined' ? window.__companions : undefined;

  const say: BotEngineHandle['say'] = (who, text, opts = {}) => {
    const companions = legacy();
    if (!companions || typeof companions.playSequence !== 'function') return;
    setState(opts.state ?? 'explaining');
    const lines: BotLine[] = [{ who, text, hold: opts.hold }];
    companions.playSequence(lines);
  };

  const fire: BotEngineHandle['fire'] = (tag, whoRemap) => {
    const companions = legacy();
    if (!companions || typeof companions.fire !== 'function') return false;
    return companions.fire(tag, whoRemap as BotId | undefined) ?? false;
  };

  return {
    getState: () => state,
    setState,
    onStateChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    say,
    fire,
  };
}

const handle = createHandle();

if (typeof window !== 'undefined') {
  window.__bots = handle;
}

export default handle;
export { handle as bots };
