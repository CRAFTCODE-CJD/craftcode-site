/* ══════════════════════════════════════════════════════
   CRAFTCODE — Client-side i18n (Read.txt §13)
   ══════════════════════════════════════════════════════
   Single-URL localization. Language swap is a DOM rewrite —
   no route prefix, no reload.

   Public API:
     getLang()     → 'en' | 'ru'
     setLang(l)    → persist + apply + emit 'langchange'
     t(key, lang?) → string | null (null = no match)
     initI18n()    → auto-init (run once from Base.astro)
     onLangChange(cb) → subscribe

   Translation hooks in DOM:
     <el data-i18n="key">fallback text</el>
     <el data-i18n-attr="alt:img.alt, title:hero.name">…</el>
                                                              */

import en from './translations/en.json';
import ru from './translations/ru.json';

export type Lang = 'en' | 'ru';
type Dict = Record<string, string>;

const TABLE: Record<Lang, Dict> = { en: en as Dict, ru: ru as Dict };
const LANG_KEY = 'lang';

/** Resolve current language from storage → navigator → default. */
export function getLang(): Lang {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === 'en' || stored === 'ru') return stored;
  }
  if (typeof navigator !== 'undefined') {
    return (navigator.language || 'en').toLowerCase().startsWith('ru') ? 'ru' : 'en';
  }
  return 'ru';
}

/** Lookup key with EN fallback, or null if absent. §13.11 */
export function t(key: string, lang: Lang = getLang()): string | null {
  const primary = TABLE[lang]?.[key];
  if (typeof primary === 'string') return primary;
  const fallback = TABLE.en?.[key];
  return typeof fallback === 'string' ? fallback : null;
}

/** Apply translations to every tagged node under `root`. */
function apply(lang: Lang, root: ParentNode = document): void {
  // Text-content swaps
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (!key) return;
    const translated = t(key, lang);
    if (translated !== null) el.textContent = translated;
  });
  // Attribute swaps: data-i18n-attr="alt:img.alt, title:hero.name"
  root.querySelectorAll<HTMLElement>('[data-i18n-attr]').forEach((el) => {
    const raw = el.dataset.i18nAttr ?? '';
    raw.split(',').forEach((pair) => {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (!attr || !key) return;
      const v = t(key, lang);
      if (v !== null) el.setAttribute(attr, v);
    });
  });
  // Lang toggle button state
  root.querySelectorAll<HTMLButtonElement>('.cc-lang-btn[data-lang]').forEach((btn) => {
    const match = btn.dataset.lang === lang;
    btn.classList.toggle('active', match);
    btn.setAttribute('aria-pressed', match ? 'true' : 'false');
  });
}

/** Persist + apply + broadcast. */
export function setLang(lang: Lang): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(LANG_KEY, lang);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.documentElement.dataset.lang = lang;
  }
  apply(lang);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<Lang>('langchange', { detail: lang }));
  }
}

/** Subscribe to language changes. Returns an unsubscribe fn. */
export function onLangChange(cb: (lang: Lang) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<Lang>).detail);
  window.addEventListener('langchange', handler);
  return () => window.removeEventListener('langchange', handler);
}

/** Boot: set <html lang>, apply dictionary to existing DOM, wire up the
 *  `.cc-lang-btn` toggle. Safe to call multiple times. */
export function initI18n(): void {
  if (typeof document === 'undefined') return;
  if ((window as typeof window & { __i18nReady?: boolean }).__i18nReady) return;
  (window as typeof window & { __i18nReady?: boolean }).__i18nReady = true;

  const lang = getLang();
  document.documentElement.lang = lang;
  document.documentElement.dataset.lang = lang;
  apply(lang);

  // Event delegation — Topbar.astro renders buttons with data-lang="en|ru".
  document.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement)?.closest<HTMLButtonElement>('.cc-lang-btn[data-lang]');
    if (!target) return;
    const next = target.dataset.lang as Lang | undefined;
    if (next === 'en' || next === 'ru') setLang(next);
  });

  // Catch nodes inserted after first paint (bot dialogue bubbles, etc.)
  if ('MutationObserver' in window) {
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType === 1) {
            const el = n as HTMLElement;
            if (el.hasAttribute?.('data-i18n') || el.hasAttribute?.('data-i18n-attr') ||
                el.querySelector?.('[data-i18n], [data-i18n-attr]')) {
              apply(getLang(), el);
            }
          }
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
}
