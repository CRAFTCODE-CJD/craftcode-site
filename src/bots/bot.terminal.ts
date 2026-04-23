/* ══════════════════════════════════════════════════════
   CRAFTCODE — Fake terminal controller (Read.txt §7)
   ══════════════════════════════════════════════════════
   Mounts inside the .companions host, or any element with
   [data-terminal]. Runs user input through bot.ai.ts →
   bot.engine.ts, with typewriter reveal and history.        */

import { bots } from './bot.engine';
import { respond } from './bot.ai';
import type { AICtx, BotLine } from './bot.types';
import { t } from '~/i18n/i18n';

interface TerminalOptions {
  host: HTMLElement;
  lang?: 'en' | 'ru';
  plugins?: string[];
  /** Per-char delay range (ms). */
  typeDelay?: [number, number];
}

function detectLang(): 'en' | 'ru' {
  if (typeof document === 'undefined') return 'en';
  const stored = localStorage.getItem('lang');
  if (stored === 'en' || stored === 'ru') return stored;
  return (navigator.language || 'en').toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

function buildShell(host: HTMLElement): { scroll: HTMLElement; input: HTMLInputElement } {
  while (host.firstChild) host.removeChild(host.firstChild);

  const term = document.createElement('div');
  term.className = 'term';
  term.setAttribute('role', 'log');
  term.setAttribute('aria-live', 'polite');

  const scroll = document.createElement('div');
  scroll.className = 'term-scroll';
  scroll.dataset.termScroll = '';
  term.appendChild(scroll);

  const row = document.createElement('div');
  row.className = 'term-line term-input-row';
  const prompt = document.createElement('span');
  prompt.className = 'term-prompt';
  prompt.setAttribute('aria-hidden', 'true');
  row.appendChild(prompt);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'term-input';
  input.dataset.termInput = '';
  input.autocomplete = 'off';
  input.autocapitalize = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-label', 'terminal input');
  row.appendChild(input);

  term.appendChild(row);
  host.appendChild(term);
  return { scroll, input };
}

export function mountTerminal(opts: TerminalOptions): () => void {
  const { host } = opts;
  const typeDelay = opts.typeDelay ?? [18, 38];
  const { scroll, input } = buildShell(host);
  const history: string[] = [];
  let historyIdx = -1;

  const addLine = (cls: string, text: string): HTMLElement => {
    const el = document.createElement('div');
    el.className = `term-line ${cls}`;
    el.textContent = text;
    scroll.appendChild(el);
    scroll.scrollTop = scroll.scrollHeight;
    return el;
  };

  const typeLine = async (cls: string, text: string): Promise<void> => {
    const el = addLine(cls, '');
    for (const ch of text) {
      el.textContent += ch;
      const d = typeDelay[0] + Math.random() * (typeDelay[1] - typeDelay[0]);
      await new Promise((r) => setTimeout(r, d));
    }
    scroll.scrollTop = scroll.scrollHeight;
  };

  const runLines = async (lines: BotLine[]): Promise<void> => {
    for (const l of lines) {
      const cls = l.who === 'craft' ? 'term-out term-out--info' : 'term-out term-out--ok';
      await typeLine(cls, `${l.who}: ${l.text}`);
      if (l.hold) await new Promise((r) => setTimeout(r, l.hold));
    }
  };

  const handleSubmit = async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    addLine('term-echo', `>>> ${trimmed}`);
    history.unshift(trimmed);
    if (history.length > 32) history.length = 32;
    historyIdx = -1;

    const ctx: AICtx = {
      lang: opts.lang ?? detectLang(),
      rapport: 50,
      plugins: opts.plugins ?? [],
    };

    bots.setState('thinking');
    const reply = respond(trimmed, ctx);
    await new Promise((r) => setTimeout(r, reply.delay ?? 200));
    bots.setState(reply.state);
    await runLines(reply.lines);
    if (reply.fireTag) bots.fire(reply.fireTag);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = input.value;
      input.value = '';
      void handleSubmit(value);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIdx + 1 < history.length) historyIdx += 1;
      input.value = history[historyIdx] ?? '';
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx > 0) {
        historyIdx -= 1;
        input.value = history[historyIdx];
      } else {
        historyIdx = -1;
        input.value = '';
      }
    } else if (e.key === 'Escape') {
      host.classList.remove('term-open');
    }
  };
  input.addEventListener('keydown', onKey);
  input.focus();

  // Boot banner — localized
  const lang = opts.lang ?? detectLang();
  void runLines([
    { who: 'code', text: t('bot.terminal.online', lang) ?? 'terminal online.' },
    { who: 'code', text: t('bot.terminal.hint', lang) ?? 'type `help` for commands.' },
  ]);

  return () => {
    input.removeEventListener('keydown', onKey);
    while (host.firstChild) host.removeChild(host.firstChild);
  };
}

/** Auto-mount: binds a global `/` hotkey that opens a terminal overlay
 *  inside any element with [data-terminal-mount]. */
export function bindGlobalTerminal(opts: Omit<TerminalOptions, 'host'> = {}): void {
  if (typeof document === 'undefined') return;
  let disposer: (() => void) | null = null;

  const openInto = (host: HTMLElement) => {
    if (disposer) return;
    host.classList.add('term-open');
    disposer = mountTerminal({ ...opts, host });
  };

  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    const isTyping =
      target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    if (e.key === '/' && !isTyping) {
      const host = document.querySelector<HTMLElement>('[data-terminal-mount]');
      if (!host) return;
      e.preventDefault();
      openInto(host);
    } else if (e.key === 'Escape' && disposer) {
      disposer();
      disposer = null;
      document.querySelector<HTMLElement>('[data-terminal-mount]')?.classList.remove('term-open');
    }
  });
}
