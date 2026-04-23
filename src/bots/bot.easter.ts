/* ══════════════════════════════════════════════════════
   CRAFTCODE — Easter eggs (Read.txt §7)
   ══════════════════════════════════════════════════════
   Currently wired:
     · Konami code → bot.state = 'easter', briefly glitches
       the whole document, fires "konami" scene through the
       legacy dialogue engine.
                                                              */

import { bots } from './bot.engine';

const KONAMI: readonly string[] = [
  'ArrowUp', 'ArrowUp',
  'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight',
  'ArrowLeft', 'ArrowRight',
  'KeyB', 'KeyA',
];

function triggerKonami(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.add('is-glitching');
  bots.setState('easter');
  bots.fire('konami');
  setTimeout(() => {
    document.documentElement.classList.remove('is-glitching');
  }, 1800);
}

export function bindEasterEggs(): void {
  if (typeof document === 'undefined') return;
  let idx = 0;
  document.addEventListener('keydown', (e) => {
    const want = KONAMI[idx];
    const got = e.code;
    if (got === want) {
      idx += 1;
      if (idx === KONAMI.length) {
        idx = 0;
        triggerKonami();
      }
    } else {
      idx = got === KONAMI[0] ? 1 : 0;
    }
  });
}
