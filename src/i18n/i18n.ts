/* ══════════════════════════════════════════════════════
   CRAFTCODE — Client-side i18n (Read.txt §13)
   ══════════════════════════════════════════════════════
   Single-URL localization. Language swap is a DOM rewrite —
   no route prefix, no reload.

   Public API:
     getLang()                → 'en' | 'ru'
     setLang(l)               → Promise<void>; persist + apply + emit 'langchange'
     t(key, lang?)            → string | null (null = no match; sync after initI18n)
     initI18n({scopes?})      → Promise<void>; auto-init (run once from Base.astro)
     onLangChange(cb)         → subscribe

   Translation hooks in DOM:
     <el data-i18n="key">fallback text</el>
     <el data-i18n-attr="alt:img.alt, title:hero.name">…</el>

   Scope-split (Phase 5b, mobile-perf pass 2):
   ───────────────────────────────────────────
   The dictionary is sliced into three scopes so we never ship the full
   ~168 KB blob on every page:

     common   — nav/footer/bot/site/* keys present on every route (~9 KB)
     plugin   — every `plugin.*` key (~120 KB) — only loaded on plugin pages
     dialogue — every `dialogue.*` key (~34 KB) — only loaded where KAPLAY runs

   Pages declare which scopes they need via `data-i18n-scopes` on <html>:
     <html data-i18n-scopes="common,plugin">…</html>
   Defaults to "common" when the attribute is missing.
                                                              */

export type Lang = 'en' | 'ru';
export type Scope = 'common' | 'plugin' | 'dialogue';
type Dict = Record<string, string>;

const ALL_SCOPES: Scope[] = ['common', 'plugin', 'dialogue'];

// cache[lang][scope] = Dict — once a scope is loaded it stays in memory.
const cache: Partial<Record<Lang, Partial<Record<Scope, Dict>>>> = {};
const inflight: Partial<Record<Lang, Partial<Record<Scope, Promise<Dict>>>>> = {};
const LANG_KEY = 'lang';

function loadScope(lang: Lang, scope: Scope): Promise<Dict> {
  cache[lang] ??= {};
  const cached = cache[lang]![scope];
  if (cached) return Promise.resolve(cached);

  inflight[lang] ??= {};
  const pending = inflight[lang]![scope];
  if (pending) return pending;

  // Vite needs static import shapes per file — branch on lang+scope. The
  // dynamic `import()` triggers a code-split chunk per JSON, which is exactly
  // what we want: only the requested scope is fetched on a given route.
  const promise: Promise<Dict> = (async () => {
    let mod: { default: Dict };
    if (lang === 'en') {
      mod = scope === 'common'
        ? await import('./translations/en/common.json')
        : scope === 'plugin'
          ? await import('./translations/en/plugin.json')
          : await import('./translations/en/dialogue.json');
    } else {
      mod = scope === 'common'
        ? await import('./translations/ru/common.json')
        : scope === 'plugin'
          ? await import('./translations/ru/plugin.json')
          : await import('./translations/ru/dialogue.json');
    }
    cache[lang]![scope] = mod.default;
    return mod.default;
  })();

  inflight[lang]![scope] = promise;
  return promise;
}

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

/** Read the requested scopes from <html data-i18n-scopes="...">. */
function activeScopes(): Scope[] {
  if (typeof document === 'undefined') return ['common'];
  const raw = document.documentElement.dataset.i18nScopes;
  if (!raw) return ['common'];
  const parsed = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is Scope => (ALL_SCOPES as string[]).includes(s));
  return parsed.length > 0 ? parsed : ['common'];
}

/** Lookup key with EN fallback, or null if absent. §13.11
 *  Sync — reads from in-memory cache populated by loadScope().
 *  Searches every loaded scope; first hit wins. */
export function t(key: string, lang: Lang = getLang()): string | null {
  const langCache = cache[lang];
  if (langCache) {
    for (const scope of ALL_SCOPES) {
      const v = langCache[scope]?.[key];
      if (typeof v === 'string') return v;
    }
  }
  const enCache = cache.en;
  if (enCache) {
    for (const scope of ALL_SCOPES) {
      const v = enCache[scope]?.[key];
      if (typeof v === 'string') return v;
    }
  }
  return null;
}

/** Inline-markdown → HTML. Handles the subset our extractor produces:
 *  `**bold**`, `*em*`, `` `code` ``, `[text](url)`. Raw HTML tags present in
 *  the source (<kbd>, <br>) pass through untouched. */
function mdInlineToHtml(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t, u) => `<a href="${u}">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

/** Strip obviously-unsafe constructs. Translations are our own authored
 *  MDX, so this is defense-in-depth rather than primary XSS protection.
 *  Allowed by omission: <strong>, <em>, <code>, <a>, <kbd>, <br>, <span>. */
function sanitize(html: string): string {
  return html
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*script\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

/** Translation value needs rich-HTML treatment if it contains raw HTML tags
 *  or any of our supported inline-markdown markers. */
function needsHtml(val: string): boolean {
  return /<[a-z][\s\S]*?>|\*\*|`|\[[^\]]+\]\([^)]+\)/i.test(val);
}

/** Replace element children with parsed-and-sanitized HTML. Uses
 *  Range.createContextualFragment so the HTML string is parsed by the
 *  browser's HTML parser, then sanitized before insertion. */
function setRichContent(el: HTMLElement, html: string): void {
  const clean = sanitize(html);
  const range = document.createRange();
  range.selectNodeContents(el);
  const frag = range.createContextualFragment(clean);
  el.replaceChildren(frag);
}

/** Apply translations to every tagged node under `root`. */
function apply(lang: Lang, root: ParentNode = document): void {
  // Text swaps — use rich-HTML path when the value carries inline markdown
  // or raw HTML (so **bold** / `code` / [link](url) / <kbd> survive
  // re-application on every language switch).
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (!key) return;
    const translated = t(key, lang);
    if (translated === null) return;
    if (needsHtml(translated)) {
      setRichContent(el, mdInlineToHtml(translated));
    } else {
      el.textContent = translated;
    }
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

/** Persist + apply + broadcast. Loads the active scopes for the target
 *  language if not cached. Note: scope-set is read from <html>, so a page
 *  that doesn't ask for `plugin` scope will skip that download even after
 *  a language switch. */
export async function setLang(lang: Lang): Promise<void> {
  if (typeof localStorage !== 'undefined') localStorage.setItem(LANG_KEY, lang);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.documentElement.dataset.lang = lang;
  }
  const scopes = activeScopes();
  await Promise.all(scopes.map((s) => loadScope(lang, s)));
  apply(lang);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<Lang>('langchange', { detail: lang }));
  }
}

/** Imperatively load an extra scope at runtime — used by the KAPLAY bridge
 *  when it boots after a poster tap and needs `dialogue.*` keys. Re-applies
 *  translations once the scope is in memory so any nodes already in the DOM
 *  pick up newly-resolvable keys. */
export async function ensureScope(scope: Scope): Promise<void> {
  const lang = getLang();
  await loadScope(lang, scope);
  if (typeof document !== 'undefined') apply(lang);
}

/** Subscribe to language changes. Returns an unsubscribe fn. */
export function onLangChange(cb: (lang: Lang) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<Lang>).detail);
  window.addEventListener('langchange', handler);
  return () => window.removeEventListener('langchange', handler);
}

/** Boot: set <html lang>, load active scopes for active language, apply
 *  dictionary to existing DOM, wire up the `.cc-lang-btn` toggle. Safe to
 *  call multiple times. Returns a Promise that resolves once the active
 *  scopes are loaded and the initial DOM pass is complete. */
export async function initI18n(): Promise<void> {
  if (typeof document === 'undefined') return;

  // Expose a minimal runtime API for non-module consumers (KAPLAY bridge,
  // engine.legacy.js, etc). Must happen on EVERY call — the ready-guard
  // below can bail out a second time, and we can't leave the API missing
  // just because initI18n was re-imported in a view-transition scenario.
  (window as unknown as { __i18n?: unknown }).__i18n = { t, getLang, onLangChange, ensureScope };

  if ((window as typeof window & { __i18nReady?: boolean }).__i18nReady) return;
  (window as typeof window & { __i18nReady?: boolean }).__i18nReady = true;

  const lang = getLang();
  document.documentElement.lang = lang;
  document.documentElement.dataset.lang = lang;

  // Load active language scopes before first DOM pass so t() returns values.
  const scopes = activeScopes();
  await Promise.all(scopes.map((s) => loadScope(lang, s)));
  apply(lang);

  // Event delegation — Topbar.astro renders buttons with data-lang="en|ru".
  document.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement)?.closest<HTMLButtonElement>('.cc-lang-btn[data-lang]');
    if (!target) return;
    const next = target.dataset.lang as Lang | undefined;
    if (next === 'en' || next === 'ru') void setLang(next);
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

// Expose the runtime API at module-import time so consumers (KAPLAY
// bridge, legacy engine) can call `window.__i18n.t()` without waiting
// for initI18n() to run. initI18n() re-publishes the same object —
// this just plugs the window between module-load and init().
if (typeof window !== 'undefined') {
  (window as unknown as { __i18n?: unknown }).__i18n = { t, getLang, onLangChange, ensureScope };
}
